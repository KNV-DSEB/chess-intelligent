import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const baseUrl = process.env.TASK015_BASE_URL ?? 'https://localhost';
const chromePath = process.env.TASK015_CHROME_PATH;
const academyA = process.env.TASK015_ACADEMY_A;
const academyB = process.env.TASK015_ACADEMY_B;
const ownerMembershipId = process.env.TASK015_OWNER_MEMBERSHIP_ID;
const playerId = process.env.TASK015_PLAYER_ID;
const v2PlanId = process.env.TASK015_V2_PLAN_ID;
const v2GraphId = process.env.TASK015_V2_GRAPH_ID;
const trainingItems = JSON.parse(process.env.TASK015_TRAINING_ITEMS ?? '[]');
const resume = process.env.TASK015_RESUME === 'true';
const priorAssignments = JSON.parse(process.env.TASK015_PRIOR_ASSIGNMENTS ?? '{}');
const roleAddendum = process.env.TASK015_ROLE_ADDENDUM === 'true';
const resultPath = process.env.TASK015_RESULT_PATH ?? '.tmp-task015-runtime/browser-gate.json';
const identities = {
  owner: { email: process.env.TASK015_OWNER_EMAIL, password: process.env.TASK015_OWNER_PASSWORD },
  ownerB: {
    email: process.env.TASK015_OWNER_B_EMAIL,
    password: process.env.TASK015_OWNER_PASSWORD,
  },
  admin: { email: process.env.TASK015_ADMIN_EMAIL, password: process.env.TASK015_ADMIN_PASSWORD },
  coach: { email: process.env.TASK015_COACH_EMAIL, password: process.env.TASK015_COACH_PASSWORD },
  student: {
    email: process.env.TASK015_STUDENT_EMAIL,
    password: process.env.TASK015_STUDENT_PASSWORD,
  },
};

for (const [name, value] of Object.entries({
  chromePath,
  academyA,
  academyB,
  ownerMembershipId,
  playerId,
  v2PlanId,
  v2GraphId,
  ...Object.fromEntries(
    Object.entries(identities).flatMap(([role, identity]) => [
      [`${role}Email`, identity.email],
      [`${role}Password`, identity.password],
    ]),
  ),
})) {
  if (!value) throw new Error(`${name} is required.`);
}
if (trainingItems.length < 3) throw new Error('At least three V2 TrainingItems are required.');

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function mailpit(pathname) {
  try {
    const output = execFileSync(
      'docker',
      [
        'compose',
        '--env-file',
        '.tmp-task015-runtime/compose.env',
        '-p',
        'chess-intelligent-task015',
        '-f',
        'docker-compose.production.yml',
        'exec',
        '-T',
        'mailpit',
        'wget',
        '-qO-',
        `http://127.0.0.1:8025${pathname}`,
      ],
      { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return JSON.parse(output);
  } catch {
    throw new Error('Mailpit internal inspection failed.');
  }
}

function recipientAddresses(message) {
  const recipients = message.To ?? message.to ?? [];
  return recipients.map((recipient) =>
    String(recipient.Address ?? recipient.address ?? recipient.Email ?? recipient.email ?? ''),
  );
}

async function waitForMailLink(email, route) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const listing = mailpit('/api/v1/messages');
    const messages = listing.messages ?? listing.Messages ?? [];
    const message = messages.find((candidate) =>
      recipientAddresses(candidate).some(
        (recipient) => recipient.toLowerCase() === email.toLowerCase(),
      ),
    );
    if (message) {
      const id = message.ID ?? message.Id ?? message.id;
      const detail = mailpit(`/api/v1/message/${encodeURIComponent(id)}`);
      const encoded = JSON.stringify(detail).replaceAll('&amp;', '&');
      const match = encoded.match(new RegExp(`https://localhost/${route}/[A-Za-z0-9._~%+-]+`, 'u'));
      if (match) return match[0];
    }
    await delay(500);
  }
  throw new Error(`No ${route} message arrived for ${email}.`);
}

class CdpClient {
  constructor(socketUrl) {
    this.socket = new WebSocket(socketUrl);
    this.nextId = 0;
    this.pending = new Map();
    this.contexts = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const waiter = this.pending.get(message.id);
        if (!waiter) return;
        this.pending.delete(message.id);
        if (message.error) waiter.reject(new Error(message.error.message));
        else waiter.resolve(message.result);
        return;
      }
      const context = this.contexts.get(message.sessionId);
      if (!context) return;
      if (message.method === 'Runtime.exceptionThrown') context.exceptions.push(message.params);
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        context.consoleErrors.push(message.params);
      }
      if (
        message.method === 'Network.loadingFailed' &&
        message.params.blockedReason === 'mixed-content'
      ) {
        context.mixedContentFailures.push(message.params);
      }
    });
  }

  async command(method, parameters = {}, sessionId) {
    await this.ready;
    const id = ++this.nextId;
    this.socket.send(
      JSON.stringify({ id, method, params: parameters, ...(sessionId ? { sessionId } : {}) }),
    );
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  async createContext(name) {
    const { browserContextId } = await this.command('Target.createBrowserContext');
    const { targetId } = await this.command('Target.createTarget', {
      url: 'about:blank',
      browserContextId,
    });
    const { sessionId } = await this.command('Target.attachToTarget', { targetId, flatten: true });
    const context = {
      name,
      browserContextId,
      targetId,
      sessionId,
      exceptions: [],
      consoleErrors: [],
      mixedContentFailures: [],
    };
    this.contexts.set(sessionId, context);
    await Promise.all(
      ['Page.enable', 'Runtime.enable', 'Network.enable', 'Accessibility.enable'].map((method) =>
        this.command(method, {}, sessionId),
      ),
    );
    return context;
  }

  close() {
    this.socket.close();
  }
}

let client;

async function evaluate(context, expression) {
  const result = await client.command(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    context.sessionId,
  );
  if (result.exceptionDetails) throw new Error(`Browser evaluation failed in ${context.name}.`);
  return result.result.value;
}

async function waitFor(context, expression, label, timeout = 12_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(context, `Boolean(${expression})`)) return;
    await delay(150);
  }
  throw new Error(`${context.name} timed out waiting for ${label}.`);
}

async function goto(context, pathname) {
  await client.command('Page.navigate', { url: `${baseUrl}${pathname}` }, context.sessionId);
  await waitFor(context, `document.readyState !== 'loading'`, `navigation ${pathname}`);
  await delay(350);
}

async function setValue(context, selector, value) {
  await evaluate(
    context,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) throw new Error('Missing control');
      const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype
        : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, ${JSON.stringify(value)});
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`,
  );
}

async function click(context, selector) {
  await evaluate(
    context,
    `(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) throw new Error('Missing click target'); element.click(); return true; })()`,
  );
}

async function submit(context, selector) {
  await evaluate(
    context,
    `(() => { const form = document.querySelector(${JSON.stringify(selector)}); if (!form) throw new Error('Missing form'); form.requestSubmit(); return true; })()`,
  );
}

async function text(context, selector = 'body') {
  return evaluate(
    context,
    `document.querySelector(${JSON.stringify(selector)})?.textContent?.trim() ?? ''`,
  );
}

async function request(context, pathname, options = {}) {
  return evaluate(
    context,
    `(async () => {
      const response = await fetch(${JSON.stringify(`/api${pathname}`)}, ${JSON.stringify(options)});
      let body = null;
      try { body = await response.json(); } catch {}
      return {
        status: response.status,
        code: body?.error?.code ?? null,
        id: body?.id ?? body?.assignment?.id ?? null,
        hasAcceptedMoves: Object.hasOwn(body?.item ?? body ?? {}, 'acceptedMoveUcis'),
      };
    })()`,
  );
}

async function login(context, identity) {
  await goto(context, '/login');
  await waitFor(context, `document.querySelector('input[name="email"]')`, 'login form');
  await setValue(context, 'input[name="email"]', identity.email);
  await setValue(context, 'input[name="password"]', identity.password);
  await submit(context, 'form');
  await waitFor(context, `location.pathname === '/my'`, 'successful login');
  const me = await request(context, '/auth/me');
  const cookies = await client.command(
    'Network.getCookies',
    { urls: [baseUrl] },
    context.sessionId,
  );
  const session = cookies.cookies.find((cookie) => cookie.name === '__Host-chess_session');
  return {
    meStatus: me.status,
    cookie: session
      ? {
          name: session.name,
          secure: session.secure,
          httpOnly: session.httpOnly,
          sameSite: session.sameSite,
          path: session.path,
        }
      : null,
  };
}

async function openAcademy(context, id, expectAdministration = false) {
  await goto(context, `/academy?academyId=${id}`);
  await waitFor(context, `document.querySelector('.academy-context-form input')`, 'Academy form');
  await setValue(context, '.academy-context-form input', id);
  await submit(context, '.academy-context-form');
  await waitFor(context, `document.querySelector('.academy-security-note')`, 'Academy roster');
  if (expectAdministration) {
    await waitFor(
      context,
      `document.querySelector('[data-testid="create-invitation"]')`,
      'Academy administration',
    );
  }
}

async function createInvitation(context, role, email, existingMembershipId = '') {
  await setValue(context, '[data-testid="create-invitation"] input[name="email"]', email);
  await setValue(context, '[data-testid="create-invitation"] select', role);
  if (existingMembershipId) {
    await waitFor(
      context,
      `document.querySelector('[data-testid="create-invitation"] select[name="existingMembershipId"] option[value="${existingMembershipId}"]')`,
      'Student invitation membership option',
    );
    await setValue(
      context,
      '[data-testid="create-invitation"] select[name="existingMembershipId"]',
      existingMembershipId,
    );
  }
  await submit(context, '[data-testid="create-invitation"]');
  await waitFor(
    context,
    `document.querySelector('.status-info')?.textContent?.includes('Invitation delivered')`,
    `${role} invitation delivery`,
  );
  return waitForMailLink(email, 'invitations');
}

async function acceptInvitation(context, link, identity, displayName) {
  const pathname = new URL(link).pathname;
  await goto(context, pathname);
  await waitFor(context, `document.querySelector('input[name="displayName"]')`, 'invitation form');
  await setValue(context, 'input[name="displayName"]', displayName);
  await setValue(context, 'input[name="password"]', identity.password);
  await submit(context, 'form');
  await waitFor(
    context,
    `document.body.textContent.includes('Account ready')`,
    'invitation acceptance',
  );
  return pathname;
}

async function createStudentMembership(context, displayName, targetPlayerId, requiresConsent) {
  await setValue(
    context,
    '[data-testid="create-membership"] input[name="displayName"]',
    displayName,
  );
  await setValue(context, '[data-testid="create-membership"] select', 'STUDENT');
  await submit(context, '[data-testid="create-membership"]');
  await waitFor(
    context,
    `document.querySelector('.status-info')?.textContent?.includes('Created unclaimed STUDENT')`,
    'Student membership creation',
  );
  const notice = await text(context, '.status-info');
  const membershipId = notice.match(/[0-9a-f]{8}-[0-9a-f-]{27,}/u)?.[0];
  if (!membershipId) throw new Error('Student membership ID was not visible after creation.');

  await waitFor(
    context,
    `document.querySelector('[data-testid="link-student-profile"] option[value="${membershipId}"]')`,
    'Student membership link option',
  );
  await setValue(
    context,
    '[data-testid="link-student-profile"] select[name="membershipId"]',
    membershipId,
  );
  await setValue(
    context,
    '[data-testid="link-student-profile"] input[name="playerId"]',
    targetPlayerId,
  );
  if (requiresConsent) {
    await click(
      context,
      '[data-testid="link-student-profile"] input[name="requiresGuardianConsent"]',
    );
  }
  await submit(context, '[data-testid="link-student-profile"]');
  await waitFor(
    context,
    `document.querySelector('.status-info')?.textContent?.includes('Linked the Student')`,
    'Student profile link',
  );
  await submit(context, '.academy-context-form');
  await waitFor(
    context,
    `document.querySelector('.academy-student-card a[href*="/academy/students/"]')`,
    'Student roster card',
  );
  const href = await evaluate(
    context,
    `document.querySelector('.academy-student-card a[href*="/academy/students/"]').getAttribute('href')`,
  );
  return { membershipId, studentProfileId: href.match(/students\/([^?]+)/u)?.[1] };
}

async function createAssignment(context, id, studentProfileId, itemIndex, note) {
  await goto(context, `/academy/students/${studentProfileId}?academyId=${id}`);
  await waitFor(context, `document.querySelector('.academy-assignment-form')`, 'assignment form');
  await setValue(context, '.academy-assignment-form select', v2PlanId);
  const selected = await evaluate(
    context,
    `(() => {
      const inputs = [...document.querySelectorAll('.academy-item-picker input:not(:disabled)')];
      const input = inputs[${itemIndex}] ?? inputs[0];
      if (!input) return false;
      input.click();
      return true;
    })()`,
  );
  if (!selected) throw new Error(`${context.name} found no assignable TrainingItem.`);
  await setValue(context, '.academy-assignment-form textarea[name="note"]', note);
  await submit(context, '.academy-assignment-form');
  await waitFor(
    context,
    `document.querySelector('.notice')?.textContent?.includes('created without creating mastery evidence')`,
    'assignment creation',
  );
  const notice = await text(context, '.notice');
  return notice.match(/[0-9a-f]{8}-[0-9a-f-]{27,}/u)?.[0];
}

async function updateMembershipStatusByDisplayName(context, displayName, status) {
  const updated = await evaluate(
    context,
    `(() => {
      const button = [...document.querySelectorAll('.academy-management-list button')]
        .find((candidate) => candidate.textContent?.includes(${JSON.stringify(displayName)}));
      const form = button?.closest('form');
      const select = form?.querySelector('select[name="status"]');
      if (!form || !select) return false;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(status)});
      select.dispatchEvent(new Event('change', { bubbles: true }));
      form.requestSubmit();
      return true;
    })()`,
  );
  if (!updated) throw new Error(`${context.name} could not find membership ${displayName}.`);
  await waitFor(
    context,
    `document.querySelector('.status-info')?.textContent?.includes(${JSON.stringify(`${displayName} is ${status.toLowerCase()}`)})`,
    `${displayName} ${status}`,
  );
}

async function viewportAudit(context, pathname, width, height) {
  await client.command(
    'Emulation.setDeviceMetricsOverride',
    { width, height, deviceScaleFactor: 1, mobile: width < 600 },
    context.sessionId,
  );
  await goto(context, pathname);
  return evaluate(
    context,
    `({
      width: innerWidth,
      path: location.pathname,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      mixedContentResources: performance.getEntriesByType('resource').filter((entry) => entry.name.startsWith('http://')).length,
      unlabeledPrimaryControls: [...document.querySelectorAll('main input, main select, main textarea')].filter((control) => !control.labels?.length && !control.getAttribute('aria-label')).length
    })`,
  );
}

const profileDirectory = await mkdtemp(path.join(tmpdir(), 'task015-chrome-'));
const debuggingPort = 9335;
const chrome = spawn(
  chromePath,
  [
    '--headless=new',
    '--ignore-certificate-errors',
    '--no-first-run',
    '--disable-background-networking',
    `--remote-debugging-port=${debuggingPort}`,
    '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${profileDirectory}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

try {
  let version;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      version = await fetch(`http://127.0.0.1:${debuggingPort}/json/version`).then((response) =>
        response.json(),
      );
      break;
    } catch {
      await delay(200);
    }
  }
  if (!version) throw new Error('Chrome DevTools endpoint did not start.');
  client = new CdpClient(version.webSocketDebuggerUrl);
  await client.ready;

  const [owner, admin, coach, student, ownerB] = await Promise.all(
    ['OWNER', 'ADMIN', 'COACH', 'STUDENT', 'OWNER_B'].map((name) => client.createContext(name)),
  );
  const result = {
    chrome: version.Browser,
    contextCount: 5,
    mode: roleAddendum ? 'ROLE_ADDENDUM' : 'PRIMARY_MATRIX',
    owner: {},
    admin: {},
    coach: {},
    student: {},
    tenant: {},
    responsive: {},
  };

  result.owner.login = await login(owner, identities.owner);
  await openAcademy(owner, academyA, true);
  let studentRecord;
  let adminInvitationPath;
  if (resume) {
    const href = await evaluate(
      owner,
      `document.querySelector('.academy-student-card a[href*="/academy/students/"]')?.getAttribute('href') ?? null`,
    );
    const studentProfileId = href?.match(/students\/([^?]+)/u)?.[1];
    if (!studentProfileId) throw new Error('Resume requires the Academy A StudentProfile.');
    studentRecord = { studentProfileId };
    if (!roleAddendum) {
      adminInvitationPath = new URL(await waitForMailLink(identities.admin.email, 'invitations'))
        .pathname;
    }
  } else {
    const adminInvite = await createInvitation(owner, 'ADMIN', identities.admin.email);
    const coachInvite = await createInvitation(owner, 'COACH', identities.coach.email);
    studentRecord = await createStudentMembership(owner, 'Task 015 Student', playerId, true);
    const studentInvite = await createInvitation(
      owner,
      'STUDENT',
      identities.student.email,
      studentRecord.membershipId,
    );

    adminInvitationPath = await acceptInvitation(
      admin,
      adminInvite,
      identities.admin,
      'Task 015 Admin',
    );
    await acceptInvitation(coach, coachInvite, identities.coach, 'Task 015 Coach');
    await acceptInvitation(student, studentInvite, identities.student, 'Task 015 Student');
  }
  if (adminInvitationPath) {
    const invitationApiPath = `${adminInvitationPath.replace('/invitations/', '/auth/invitations/')}/accept`;
    result.owner.invitationReuse = await request(owner, invitationApiPath, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'Reuse blocked' }),
    });
  } else {
    result.owner.invitationReuseAlreadyMeasuredByPrimaryMatrix = true;
  }

  result.admin.login = await login(admin, identities.admin);
  result.coach.login = await login(coach, identities.coach);
  result.student.login = await login(student, identities.student);
  result.owner.consentPending = await request(
    owner,
    `/academies/${academyA}/students/${studentRecord.studentProfileId}/consent-records`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'PENDING', externalReference: 'task-015-acceptance' }),
    },
  );
  result.student.pendingConsent = await request(student, `/academies/${academyA}/me/assignments`);

  result.owner.consentGranted = await request(
    owner,
    `/academies/${academyA}/students/${studentRecord.studentProfileId}/consent-records`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'GRANTED', externalReference: 'task-015-acceptance' }),
    },
  );

  await goto(owner, `/academy/students/${studentRecord.studentProfileId}?academyId=${academyA}`);
  await waitFor(
    owner,
    `document.querySelector('.academy-assignment-form')`,
    'Owner Student detail',
  );
  result.owner.studentDetailVisible = true;

  const ownerAssignmentId = resume
    ? priorAssignments.owner
    : await createAssignment(
        owner,
        academyA,
        studentRecord.studentProfileId,
        0,
        'Owner acceptance assignment',
      );
  result.owner.assignment = { id: ownerAssignmentId };
  result.owner.lastOwnerProtection = await request(
    owner,
    `/academies/${academyA}/memberships/${ownerMembershipId}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'OWNER', status: 'DISABLED' }),
    },
  );

  await openAcademy(admin, academyA, true);
  result.admin.rosterVisible = (await text(admin)).includes('Task 015 Student');
  if (roleAddendum) {
    await createInvitation(admin, 'COACH', `admin-issued.task015.${Date.now()}@academy.test`);
    result.admin.invitationCreatedThroughUi = true;
    await updateMembershipStatusByDisplayName(admin, 'Task 015 Coach', 'DISABLED');
    await updateMembershipStatusByDisplayName(admin, 'Task 015 Coach', 'ACTIVE');
    result.admin.permittedMembershipLifecycleThroughUi = true;
  }
  await goto(admin, `/academy/students/${studentRecord.studentProfileId}?academyId=${academyA}`);
  await waitFor(
    admin,
    `document.querySelector('.academy-assignment-form')`,
    'Admin Student detail',
  );
  result.admin.studentDetailVisible = true;
  const adminAssignmentId = resume
    ? priorAssignments.admin
    : await createAssignment(
        admin,
        academyA,
        studentRecord.studentProfileId,
        1,
        'Admin acceptance assignment',
      );
  result.admin.assignment = { id: adminAssignmentId };
  result.admin.ownerMutationDenied = await request(
    admin,
    `/academies/${academyA}/memberships/${ownerMembershipId}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'ADMIN', status: 'ACTIVE' }),
    },
  );

  await openAcademy(coach, academyA, false);
  result.coach.rosterVisible = (await text(coach)).includes('Task 015 Student');
  await goto(coach, `/academy/students/${studentRecord.studentProfileId}?academyId=${academyA}`);
  await waitFor(
    coach,
    `document.querySelector('.academy-assignment-form')`,
    'Coach Student detail',
  );
  result.coach.studentDetailVisible = true;
  const coachAssignmentId = resume
    ? priorAssignments.coach
    : await createAssignment(
        coach,
        academyA,
        studentRecord.studentProfileId,
        2,
        'Coach acceptance assignment',
      );
  await goto(coach, `/academy/assignments/${coachAssignmentId}?academyId=${academyA}`);
  await waitFor(
    coach,
    `document.body.textContent.includes('Cancel assignment') || document.body.textContent.toLowerCase().includes('cancelled')`,
    'cancel action or existing cancellation',
  );
  const canCancel = await evaluate(
    coach,
    `Boolean([...document.querySelectorAll('button')].find((button) => button.textContent?.includes('Cancel assignment')))`,
  );
  if (canCancel) {
    await click(coach, 'button.secondary-button');
  }
  await waitFor(
    coach,
    `document.body.textContent.toLowerCase().includes('cancelled')`,
    'cancelled',
  );
  result.coach.assignment = { id: coachAssignmentId, cancelled: true };
  result.coach.denials = {
    invitations: await request(coach, `/academies/${academyA}/invitations`),
    memberships: await request(coach, `/academies/${academyA}/memberships`),
    audit: await request(coach, `/academies/${academyA}/audit`),
    impersonatedAttempt: await request(coach, `/training/items/${trainingItems[0].id}/attempts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ moveUci: trainingItems[0].acceptedMoveUci }),
    }),
  };

  result.ownerB = { login: await login(ownerB, identities.ownerB) };
  await openAcademy(ownerB, academyB, true);
  let studentB;
  const existingStudentBHref = await evaluate(
    ownerB,
    `document.querySelector('.academy-student-card a[href*="/academy/students/"]')?.getAttribute('href') ?? null`,
  );
  if (existingStudentBHref) {
    studentB = { studentProfileId: existingStudentBHref.match(/students\/([^?]+)/u)?.[1] };
  } else {
    studentB = await createStudentMembership(ownerB, 'Shared Player B', playerId, false);
  }
  result.tenant = {
    sharedPlayerId: playerId,
    academyAStudentProfileId: studentRecord.studentProfileId,
    academyBStudentProfileId: studentB.studentProfileId,
    coachCrossAcademyRoster: await request(
      coach,
      `/academies/${academyB}/roster?ontologyVersion=1.0.0&skillGraphPolicyVersion=SKILL_GRAPH_POLICY_V2&gameContexts=OTB&timeCategories=CLASSICAL`,
    ),
  };

  await goto(student, `/academy/${academyA}/my`);
  await waitFor(student, `document.body.textContent.includes('My assignments')`, 'Student home');
  const ownItemId = await evaluate(
    student,
    `document.querySelector('a[href^="/training?item="]')?.getAttribute('href')?.split('=')[1] ?? null`,
  );
  if (!ownItemId) throw new Error('Student has no assigned training item link.');
  result.student.preAttempt = await request(student, `/training/items/${ownItemId}`);
  if (!roleAddendum) {
    await goto(student, `/training?item=${ownItemId}`);
    await waitFor(student, `document.querySelector('.training-solver input')`, 'training solver');
    const privateItem = trainingItems.find((item) => item.id === ownItemId);
    if (!privateItem) throw new Error('Assigned item is not part of private acceptance truth.');
    await setValue(student, '.training-solver input', privateItem.acceptedMoveUci);
    await submit(student, '.training-solver form');
    await waitFor(student, `document.body.textContent.includes('Accepted move:')`, 'scored result');
  } else {
    result.student.attemptSkippedBecausePrimaryMatrixAlreadyMeasured = true;
  }
  result.student.postAttempt = await request(student, `/training/items/${ownItemId}`);
  result.student.denials = {
    roster: await request(
      student,
      `/academies/${academyA}/roster?ontologyVersion=1.0.0&skillGraphPolicyVersion=SKILL_GRAPH_POLICY_V2&gameContexts=OTB&timeCategories=CLASSICAL`,
    ),
    studentDetail: await request(
      student,
      `/academies/${academyA}/students/${studentRecord.studentProfileId}/intelligence?ontologyVersion=1.0.0&skillGraphPolicyVersion=SKILL_GRAPH_POLICY_V2&gameContexts=OTB&timeCategories=CLASSICAL`,
    ),
    assignmentCreate: await request(student, `/academies/${academyA}/assignments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        studentProfileId: studentRecord.studentProfileId,
        trainingPlanRunId: v2PlanId,
        baselineSkillGraphRunId: v2GraphId,
        trainingItemIds: [trainingItems[2].id],
      }),
    }),
    audit: await request(student, `/academies/${academyA}/audit`),
    memberships: await request(student, `/academies/${academyA}/memberships`),
    foreignItem: await request(student, `/training/items/${trainingItems[2].id}`),
  };

  result.owner.consentRevoked = await request(
    owner,
    `/academies/${academyA}/students/${studentRecord.studentProfileId}/consent-records`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'REVOKED', externalReference: 'task-015-acceptance' }),
    },
  );
  result.student.revokedConsent = await request(student, `/academies/${academyA}/me/assignments`);

  result.responsive.desktop = await viewportAudit(
    owner,
    `/academy?academyId=${academyA}`,
    1440,
    900,
  );
  result.responsive.mobile = await viewportAudit(student, '/login', 390, 844);
  result.runtimeErrors = Object.fromEntries(
    [owner, admin, coach, student, ownerB].map((context) => [
      context.name,
      {
        exceptions: context.exceptions.length,
        consoleErrors: context.consoleErrors.length,
        mixedContentFailures: context.mixedContentFailures.length,
      },
    ]),
  );

  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ status: 'PASS', resultPath })}\n`);
} finally {
  client?.close();
  chrome.kill();
  await delay(750);
  await rm(profileDirectory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  }).catch(() => undefined);
}
