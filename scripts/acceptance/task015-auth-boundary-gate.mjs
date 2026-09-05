import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const baseUrl = process.env.TASK015_BASE_URL ?? 'https://localhost';
const chromePath = process.env.TASK015_CHROME_PATH;
const academyId = process.env.TASK015_ACADEMY_A;
const studentMembershipId = process.env.TASK015_STUDENT_MEMBERSHIP_ID;
const resultPath =
  process.env.TASK015_AUTH_RESULT_PATH ?? '.tmp-task015-runtime/auth-boundary-gate.json';
const identities = {
  owner: { email: process.env.TASK015_OWNER_EMAIL, password: process.env.TASK015_OWNER_PASSWORD },
  admin: { email: process.env.TASK015_ADMIN_EMAIL, password: process.env.TASK015_ADMIN_PASSWORD },
  coach: { email: process.env.TASK015_COACH_EMAIL, password: process.env.TASK015_COACH_PASSWORD },
  student: {
    email: process.env.TASK015_STUDENT_EMAIL,
    password: process.env.TASK015_STUDENT_PASSWORD,
  },
};
const resetPassword = process.env.TASK015_RESET_PASSWORD;
const changedPassword = process.env.TASK015_CHANGED_PASSWORD;

for (const [name, value] of Object.entries({
  chromePath,
  academyId,
  studentMembershipId,
  resetPassword,
  changedPassword,
  ...Object.fromEntries(
    Object.entries(identities).flatMap(([role, identity]) => [
      [`${role}Email`, identity.email],
      [`${role}Password`, identity.password],
    ]),
  ),
})) {
  if (!value) throw new Error(`${name} is required.`);
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const composeArguments = [
  'compose',
  '--env-file',
  '.tmp-task015-runtime/compose.env',
  '-p',
  'chess-intelligent-task015',
  '-f',
  'docker-compose.production.yml',
];

function compose(...arguments_) {
  return execFileSync('docker', [...composeArguments, ...arguments_], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function mailpit(pathname) {
  return JSON.parse(
    compose('exec', '-T', 'mailpit', 'wget', '-qO-', `http://127.0.0.1:8025${pathname}`),
  );
}

function messageId(message) {
  return String(message.ID ?? message.Id ?? message.id ?? '');
}

function recipientAddresses(message) {
  const recipients = message.To ?? message.to ?? [];
  return recipients.map((recipient) =>
    String(recipient.Address ?? recipient.address ?? recipient.Email ?? recipient.email ?? ''),
  );
}

function mailIdsFor(email) {
  const listing = mailpit('/api/v1/messages');
  const messages = listing.messages ?? listing.Messages ?? [];
  return new Set(
    messages
      .filter((candidate) =>
        recipientAddresses(candidate).some(
          (recipient) => recipient.toLowerCase() === email.toLowerCase(),
        ),
      )
      .map(messageId),
  );
}

async function waitForNewMailLink(email, route, previousIds) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const listing = mailpit('/api/v1/messages');
    const messages = listing.messages ?? listing.Messages ?? [];
    const message = messages.find(
      (candidate) =>
        !previousIds.has(messageId(candidate)) &&
        recipientAddresses(candidate).some(
          (recipient) => recipient.toLowerCase() === email.toLowerCase(),
        ),
    );
    if (message) {
      const detail = mailpit(`/api/v1/message/${encodeURIComponent(messageId(message))}`);
      const encoded = JSON.stringify(detail).replaceAll('&amp;', '&');
      const match = encoded.match(new RegExp(`https://localhost/${route}/[A-Za-z0-9._~%+-]+`, 'u'));
      if (match) return match[0];
    }
    await delay(500);
  }
  throw new Error(`No new ${route} message arrived.`);
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
    const context = { name, sessionId, exceptions: [], consoleErrors: [] };
    this.contexts.set(sessionId, context);
    await Promise.all(
      ['Page.enable', 'Runtime.enable', 'Network.enable'].map((method) =>
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

async function waitFor(context, expression, label, timeout = 15_000) {
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
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, ${JSON.stringify(value)});
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`,
  );
}

async function submit(context, selector) {
  await evaluate(
    context,
    `(() => { const form = document.querySelector(${JSON.stringify(selector)}); if (!form) throw new Error('Missing form'); form.requestSubmit(); return true; })()`,
  );
}

async function click(context, selector) {
  await evaluate(
    context,
    `(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) throw new Error('Missing click target'); element.click(); return true; })()`,
  );
}

async function request(context, pathname, options = {}) {
  return evaluate(
    context,
    `(async () => {
      try {
        const response = await fetch(${JSON.stringify(`/api${pathname}`)}, ${JSON.stringify(options)});
        let body = null;
        try { body = await response.json(); } catch {}
        return { status: response.status, code: body?.error?.code ?? null };
      } catch { return { status: 0, code: 'NETWORK_ERROR' }; }
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
  return request(context, '/auth/me');
}

async function logoutThroughUi(context) {
  await goto(context, '/my');
  await waitFor(context, `document.querySelector('button.link-button')`, 'session navigation');
  await click(context, 'button.link-button');
  await waitFor(context, `location.pathname === '/login'`, 'logout redirect');
  return request(context, '/auth/me');
}

async function waitForReadiness(context, expectedStatus) {
  let latest;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    latest = await request(context, '/readyz');
    if (latest.status === expectedStatus) return latest;
    await delay(500);
  }
  return latest;
}

const profileDirectory = await mkdtemp(path.join(tmpdir(), 'task015-auth-chrome-'));
const debuggingPort = 9336;
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

let mailpitStopped = false;

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

  const [ownerPrimary, ownerParallel, studentOld, resetBrowser, studentParallel, disposable] =
    await Promise.all(
      [
        'OWNER_PRIMARY',
        'OWNER_PARALLEL',
        'STUDENT_OLD',
        'RESET_BROWSER',
        'STUDENT_PARALLEL',
        'DISPOSABLE_USER',
      ].map((name) => client.createContext(name)),
    );
  const result = {
    chrome: version.Browser,
    contextCount: 6,
    sessions: {},
    passwordReset: {},
    passwordChange: {},
    membershipDisable: {},
    userDisable: {},
    smtpFailure: {},
    roleLogout: {},
  };

  result.sessions.ownerPrimaryLogin = await login(ownerPrimary, identities.owner);
  result.sessions.ownerParallelLogin = await login(ownerParallel, identities.owner);
  await goto(ownerPrimary, '/my');
  result.sessions.reload = await request(ownerPrimary, '/auth/me');
  result.sessions.primaryLogout = await logoutThroughUi(ownerPrimary);
  result.sessions.parallelSurvivesLogout = await request(ownerParallel, '/auth/me');
  await login(ownerPrimary, identities.owner);

  result.passwordReset.oldSessionLogin = await login(studentOld, identities.student);
  const priorResetMessages = mailIdsFor(identities.student.email);
  await goto(resetBrowser, '/password-reset');
  await setValue(resetBrowser, 'input[name="email"]', identities.student.email);
  await submit(resetBrowser, 'form');
  await waitFor(
    resetBrowser,
    `document.body.textContent.includes('single-use reset link')`,
    'generic reset acknowledgement',
  );
  const resetLink = await waitForNewMailLink(
    identities.student.email,
    'password-reset',
    priorResetMessages,
  );
  await goto(resetBrowser, new URL(resetLink).pathname);
  await setValue(resetBrowser, 'input[name="newPassword"]', resetPassword);
  await setValue(resetBrowser, 'input[name="confirmation"]', resetPassword);
  await submit(resetBrowser, 'form');
  await waitFor(
    resetBrowser,
    `document.body.textContent.includes('Password changed and old sessions revoked')`,
    'password reset completion',
  );
  result.passwordReset.completedThroughUi = true;
  result.passwordReset.oldSessionRevoked = await request(studentOld, '/auth/me');
  result.passwordReset.oldPasswordRejected = await request(resetBrowser, '/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(identities.student),
  });
  await goto(studentOld, new URL(resetLink).pathname);
  await setValue(studentOld, 'input[name="newPassword"]', resetPassword);
  await setValue(studentOld, 'input[name="confirmation"]', resetPassword);
  await submit(studentOld, 'form');
  await waitFor(studentOld, `document.querySelector('.error')`, 'single-use token rejection');
  result.passwordReset.tokenReuseRejected = true;

  const resetIdentity = { email: identities.student.email, password: resetPassword };
  result.passwordReset.newPasswordLogin = await login(resetBrowser, resetIdentity);
  result.passwordChange.parallelLogin = await login(studentParallel, resetIdentity);
  result.passwordChange.changed = await request(resetBrowser, '/auth/password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ currentPassword: resetPassword, newPassword: changedPassword }),
  });
  result.passwordChange.currentSessionSurvives = await request(resetBrowser, '/auth/me');
  result.passwordChange.parallelRevoked = await request(studentParallel, '/auth/me');
  result.passwordChange.previousPasswordRejected = await request(studentParallel, '/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(resetIdentity),
  });
  result.passwordChange.revokeAll = await request(resetBrowser, '/auth/sessions/revoke-all', {
    method: 'POST',
  });
  result.passwordChange.revokedSessionRejected = await request(resetBrowser, '/auth/me');
  const changedStudent = { email: identities.student.email, password: changedPassword };
  await login(resetBrowser, changedStudent);

  result.membershipDisable.disabled = await request(
    ownerPrimary,
    `/academies/${academyId}/memberships/${studentMembershipId}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'STUDENT', status: 'DISABLED' }),
    },
  );
  result.membershipDisable.immediateProtectedDenial = await request(
    resetBrowser,
    `/academies/${academyId}/me/assignments`,
  );
  result.membershipDisable.restored = await request(
    ownerPrimary,
    `/academies/${academyId}/memberships/${studentMembershipId}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'STUDENT', status: 'ACTIVE' }),
    },
  );

  const disposableIdentity = {
    email: `disabled.task015.${Date.now()}@academy.test`,
    password: changedPassword,
  };
  const previousDisposableMessages = mailIdsFor(disposableIdentity.email);
  result.userDisable.invitation = await request(
    ownerPrimary,
    `/academies/${academyId}/invitations`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: disposableIdentity.email, role: 'COACH' }),
    },
  );
  const disposableLink = await waitForNewMailLink(
    disposableIdentity.email,
    'invitations',
    previousDisposableMessages,
  );
  await goto(disposable, new URL(disposableLink).pathname);
  await waitFor(
    disposable,
    `document.querySelector('input[name="displayName"]')`,
    'invitation form',
  );
  await setValue(disposable, 'input[name="displayName"]', 'Disposable Task 015');
  await setValue(disposable, 'input[name="password"]', disposableIdentity.password);
  await submit(disposable, 'form');
  await waitFor(disposable, `document.body.textContent.includes('Account ready')`, 'account ready');
  await login(disposable, disposableIdentity);
  result.userDisable.disabled = await request(disposable, '/auth/disable', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ currentPassword: disposableIdentity.password }),
  });
  result.userDisable.sessionRejected = await request(disposable, '/auth/me');
  result.userDisable.loginRejected = await request(disposable, '/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(disposableIdentity),
  });

  compose('stop', 'mailpit');
  mailpitStopped = true;
  await delay(1_000);
  result.smtpFailure.readinessDuringOutage = await request(ownerPrimary, '/readyz');
  result.smtpFailure.publicResetNondisclosure = await request(
    ownerPrimary,
    '/auth/password-reset/request',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'missing.task015@academy.test' }),
    },
  );
  result.smtpFailure.invitationFailsClosed = await request(
    ownerPrimary,
    `/academies/${academyId}/invitations`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `smtp-failure.${Date.now()}@academy.test`, role: 'COACH' }),
    },
  );
  compose('start', 'mailpit');
  mailpitStopped = false;
  result.smtpFailure.recoveredReadiness = await waitForReadiness(ownerPrimary, 200);

  const adminLogout = await client.createContext('ADMIN_LOGOUT');
  const coachLogout = await client.createContext('COACH_LOGOUT');
  const studentLogout = await client.createContext('STUDENT_LOGOUT');
  await login(adminLogout, identities.admin);
  await login(coachLogout, identities.coach);
  await login(studentLogout, changedStudent);
  result.roleLogout.owner = await logoutThroughUi(ownerPrimary);
  result.roleLogout.ownerParallel = await logoutThroughUi(ownerParallel);
  result.roleLogout.admin = await logoutThroughUi(adminLogout);
  result.roleLogout.coach = await logoutThroughUi(coachLogout);
  result.roleLogout.student = await logoutThroughUi(studentLogout);
  result.runtimeErrors = Object.fromEntries(
    [...client.contexts.values()].map((context) => [
      context.name,
      { exceptions: context.exceptions.length, consoleErrors: context.consoleErrors.length },
    ]),
  );

  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ status: 'PASS', resultPath })}\n`);
} finally {
  if (mailpitStopped) {
    try {
      compose('start', 'mailpit');
    } catch {
      // Preserve the original gate failure while making a best-effort dependency recovery.
    }
  }
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
