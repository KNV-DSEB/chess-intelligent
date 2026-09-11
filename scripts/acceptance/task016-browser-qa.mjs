import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const baseUrl = process.env.TASK016_BASE_URL ?? 'http://127.0.0.1:3000';
const chromePath = process.env.TASK016_CHROME_PATH;
const academyId = process.env.TASK016_ACADEMY_ID;
const studentProfileId = process.env.TASK016_STUDENT_PROFILE_ID;
const outputDirectory =
  process.env.TASK016_SCREENSHOT_DIR ?? '.impeccable/review/task016-browser-qa';
const resultPath = process.env.TASK016_BROWSER_RESULT ?? '.tmp-task016-runtime/browser-qa.json';
const identities = {
  owner: {
    email: process.env.TASK016_OWNER_EMAIL,
    password: process.env.TASK016_OWNER_PASSWORD,
  },
  student: {
    email: process.env.TASK016_STUDENT_EMAIL,
    password: process.env.TASK016_STUDENT_PASSWORD,
  },
};

for (const [name, value] of Object.entries({
  chromePath,
  academyId,
  studentProfileId,
  ownerEmail: identities.owner.email,
  ownerPassword: identities.owner.password,
  studentEmail: identities.student.email,
  studentPassword: identities.student.password,
})) {
  if (!value) throw new Error(`${name} is required.`);
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

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
      if (message.method === 'Network.loadingFailed') context.networkFailures.push(message.params);
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
    const { sessionId } = await this.command('Target.attachToTarget', {
      targetId,
      flatten: true,
    });
    const context = {
      name,
      browserContextId,
      targetId,
      sessionId,
      exceptions: [],
      consoleErrors: [],
      networkFailures: [],
    };
    this.contexts.set(sessionId, context);
    await Promise.all(
      ['Page.enable', 'Runtime.enable', 'Network.enable', 'Log.enable'].map((method) =>
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
  if (result.exceptionDetails) {
    throw new Error(`Browser evaluation failed in ${context.name}: ${expression.slice(0, 100)}`);
  }
  return result.result.value;
}

async function waitFor(context, expression, label, timeout = 20_000) {
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

async function submit(context, selector) {
  await evaluate(
    context,
    `(() => {
      const form = document.querySelector(${JSON.stringify(selector)});
      if (!form) throw new Error('Missing form');
      form.requestSubmit();
      return true;
    })()`,
  );
}

async function clickByText(context, selector, label) {
  await evaluate(
    context,
    `(() => {
      const element = [...document.querySelectorAll(${JSON.stringify(selector)})]
        .find((candidate) => candidate.textContent?.trim().includes(${JSON.stringify(label)}));
      if (!element) throw new Error('Missing labeled control');
      element.click();
      return true;
    })()`,
  );
}

async function login(context, identity) {
  await goto(context, '/login');
  await waitFor(context, `document.querySelector('input[name="email"]')`, 'login form');
  await waitFor(context, `document.querySelector('form[data-hydrated="true"]')`, 'login hydration');
  await setValue(context, 'input[name="email"]', identity.email);
  await setValue(context, 'input[name="password"]', identity.password);
  await submit(context, 'form');
  await waitFor(context, `location.pathname === '/my'`, 'successful login');
}

async function setViewport(context, width, height) {
  await client.command(
    'Emulation.setDeviceMetricsOverride',
    {
      width,
      height,
      screenWidth: width,
      screenHeight: height,
      deviceScaleFactor: 1,
      mobile: false,
      scale: 1,
    },
    context.sessionId,
  );
}

async function screenshot(context, name) {
  const capture = await client.command(
    'Page.captureScreenshot',
    { format: 'png', fromSurface: true, captureBeyondViewport: false },
    context.sessionId,
  );
  const target = path.join(outputDirectory, `${name}.png`);
  await writeFile(target, Buffer.from(capture.data, 'base64'));
  return target;
}

async function keyboardSmoke(context) {
  await evaluate(
    context,
    `(() => {
      const first = document.querySelector('main a[href], main button:not([disabled]), main input:not([disabled]), main select:not([disabled])');
      first?.focus();
      return first ? true : false;
    })()`,
  );
  await client.command(
    'Input.dispatchKeyEvent',
    { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
    context.sessionId,
  );
  await client.command(
    'Input.dispatchKeyEvent',
    { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
    context.sessionId,
  );
  return evaluate(
    context,
    `(() => {
      const active = document.activeElement;
      if (!active || active === document.body) return { passed: false, target: null };
      const rect = active.getBoundingClientRect();
      return {
        passed: rect.width > 0 && rect.height > 0,
        target: active.getAttribute('aria-label') || active.textContent?.trim().slice(0, 80) || active.tagName,
      };
    })()`,
  );
}

async function auditSurface(context, input) {
  await setViewport(context, input.width, input.height);
  await goto(context, input.pathname);
  await waitFor(context, input.ready, input.label);
  const keyboard = await keyboardSmoke(context);
  const layout = await evaluate(
    context,
    `(() => {
      const root = document.documentElement;
      const allOffenders = [...document.querySelectorAll('body *')]
        .filter((element) => {
          const style = getComputedStyle(element);
          if (style.position === 'fixed' || style.display === 'none') return false;
          const rect = element.getBoundingClientRect();
          return rect.right > innerWidth + 1 || rect.left < -1;
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            className: typeof element.className === 'string' ? element.className : '',
            text: element.textContent?.trim().replace(/\\s+/gu, ' ').slice(0, 80) ?? '',
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
          };
        });
      const offenders =
        allOffenders.length <= 16
          ? allOffenders
          : [...allOffenders.slice(0, 8), ...allOffenders.slice(-8)];
      return {
        viewport: { width: innerWidth, height: innerHeight },
        documentWidth: root.scrollWidth,
        horizontalOverflow: root.scrollWidth > innerWidth + 1,
        offenders,
        heading: document.querySelector('main h1')?.textContent?.trim() ?? null,
      };
    })()`,
  );
  const image = await screenshot(context, input.screenshot);
  return { ...layout, keyboard, screenshot: image };
}

await mkdir(outputDirectory, { recursive: true });
await mkdir(path.dirname(resultPath), { recursive: true });
const profileDirectory = await mkdtemp(path.join(tmpdir(), 'task016-chrome-'));
const debuggingPort = 9346;
const chrome = spawn(
  chromePath,
  [
    '--headless=new',
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
  const [owner, student] = await Promise.all(
    ['OWNER', 'STUDENT'].map((name) => client.createContext(name)),
  );
  await login(owner, identities.owner);
  await login(student, identities.student);

  const coachPath = `/academy/students/${studentProfileId}?academyId=${academyId}`;
  const studentPath = `/academy/${academyId}/my`;
  const coachReady = `document.querySelector('.learning-intelligence') && !document.body.textContent.includes('Loading student intelligence')`;
  const studentReady = `document.querySelector('.learning-intelligence') && !document.body.textContent.includes('Loading your academy workspace')`;
  const audits = {};

  for (const viewport of [
    { width: 1440, height: 900, suffix: '1440x900' },
    { width: 1024, height: 768, suffix: '1024x768' },
    { width: 390, height: 844, suffix: '390x844' },
  ]) {
    audits[`coach-${viewport.suffix}`] = await auditSurface(owner, {
      ...viewport,
      pathname: coachPath,
      ready: coachReady,
      label: 'Coach Student Detail',
      screenshot: `coach-${viewport.suffix}`,
    });
    audits[`student-${viewport.suffix}`] = await auditSurface(student, {
      ...viewport,
      pathname: studentPath,
      ready: studentReady,
      label: 'Student Training',
      screenshot: `student-${viewport.suffix}`,
    });
  }

  await setViewport(owner, 1440, 900);
  await goto(owner, coachPath);
  await waitFor(owner, coachReady, 'Coach intelligence before AI');
  await clickByText(owner, 'button', 'Generate grounded brief');
  await waitFor(owner, `document.querySelector('.brief-claims')`, 'validated grounded brief');
  await evaluate(
    owner,
    `document.querySelector('.grounded-brief')?.scrollIntoView({ block: 'start' })`,
  );
  await delay(250);
  audits['coach-ai-1440x900'] = {
    screenshot: await screenshot(owner, 'coach-ai-1440x900'),
    citedClaims: await evaluate(owner, `document.querySelectorAll('.brief-claims > li').length`),
    citationRefs: await evaluate(
      owner,
      `[...document.querySelectorAll('.brief-citations [data-evidence-ref]')].map((element) => element.dataset.evidenceRef)`,
    ),
  };

  await evaluate(
    owner,
    `document.querySelector('.brief-citations button[data-evidence-ref]')?.click()`,
  );
  await waitFor(owner, `document.querySelector('.citation-evidence')`, 'claim citation drill-down');
  await evaluate(
    owner,
    `document.querySelector('.citation-evidence')?.scrollIntoView({ block: 'start' })`,
  );
  await delay(250);
  audits['coach-citation-1440x900'] = {
    screenshot: await screenshot(owner, 'coach-citation-1440x900'),
    exactEvidenceLinks: await evaluate(
      owner,
      `document.querySelectorAll('.citation-evidence a').length`,
    ),
  };

  await goto(owner, coachPath);
  await waitFor(owner, coachReady, 'Coach evidence before drill-down');
  await clickByText(owner, 'button', 'Inspect evidence');
  await waitFor(owner, `document.querySelector('.evidence-drawer')`, 'evidence drill-down');
  await evaluate(
    owner,
    `document.querySelector('.evidence-drawer')?.scrollIntoView({ block: 'start' })`,
  );
  await delay(250);
  audits['evidence-drilldown-1440x900'] = {
    screenshot: await screenshot(owner, 'evidence-drilldown-1440x900'),
    exactEvidenceLinks: await evaluate(
      owner,
      `document.querySelectorAll('.evidence-drawer a').length`,
    ),
  };

  await setViewport(student, 390, 844);
  await goto(student, studentPath);
  await waitFor(student, studentReady, 'Student intelligence before AI');
  await clickByText(student, 'button', 'Generate grounded brief');
  await waitFor(student, `document.querySelector('.brief-claims')`, 'Student grounded brief');
  await evaluate(
    student,
    `document.querySelector('.grounded-brief')?.scrollIntoView({ block: 'start' })`,
  );
  await delay(250);
  audits['student-ai-390x844'] = {
    screenshot: await screenshot(student, 'student-ai-390x844'),
    citedClaims: await evaluate(student, `document.querySelectorAll('.brief-claims > li').length`),
    citationRefs: await evaluate(
      student,
      `[...document.querySelectorAll('.brief-citations [data-evidence-ref]')].map((element) => element.dataset.evidenceRef)`,
    ),
  };

  await evaluate(
    student,
    `document.querySelector('.brief-citations button[data-evidence-ref]')?.click()`,
  );
  await waitFor(
    student,
    `document.querySelector('.citation-evidence')`,
    'Student citation drill-down',
  );
  await evaluate(
    student,
    `document.querySelector('.citation-evidence')?.scrollIntoView({ block: 'start' })`,
  );
  await delay(250);
  audits['student-citation-390x844'] = {
    screenshot: await screenshot(student, 'student-citation-390x844'),
    exactEvidenceLinks: await evaluate(
      student,
      `document.querySelectorAll('.citation-evidence a').length`,
    ),
  };

  const studentForbiddenNavigation = await evaluate(
    student,
    `(() => {
      const forbidden = ['/academy', '/preparation', '/import', '/ontology', '/coverage', '/intelligence/skills'];
      return [...document.querySelectorAll('header nav a')]
        .map((link) => new URL(link.href).pathname)
        .filter((pathname) => forbidden.includes(pathname));
    })()`,
  );
  const studentAssignmentContract = await evaluate(
    student,
    `(() => {
      const text = document.querySelector('.student-training-first')?.textContent ?? '';
      const labels = [...document.querySelectorAll('.student-training-first .button-link')]
        .map((link) => link.textContent?.trim() ?? '');
      return {
        hasBrokenProgress: text.includes('/ completed') || text.includes('undefined'),
        hasGenericActions: labels.some((label) => label === 'Open training item'),
        actionLabels: labels,
      };
    })()`,
  );

  audits['coverage-1024x768'] = await auditSurface(owner, {
    width: 1024,
    height: 768,
    pathname: '/coverage',
    ready: `document.body.textContent.includes('Concept coverage matrix')`,
    label: 'Coverage matrix',
    screenshot: 'coverage-1024x768',
  });

  const runtimeErrors = Object.fromEntries(
    [owner, student].map((context) => [
      context.name,
      {
        exceptions: context.exceptions.length,
        consoleErrors: context.consoleErrors.length,
        failedRequests: context.networkFailures.filter(
          (failure) => !String(failure.errorText ?? '').includes('ERR_ABORTED'),
        ).length,
      },
    ]),
  );
  const overflowFailures = Object.entries(audits)
    .filter(([, audit]) => audit.horizontalOverflow)
    .map(([name]) => name);
  const keyboardFailures = Object.entries(audits)
    .filter(([, audit]) => audit.keyboard && !audit.keyboard.passed)
    .map(([name]) => name);
  const citationFailures = ['coach-ai-1440x900', 'student-ai-390x844'].filter(
    (name) => !Array.isArray(audits[name].citationRefs) || audits[name].citationRefs.length === 0,
  );
  const assignmentContractFailures = [
    ...(studentAssignmentContract.hasBrokenProgress ? ['BROKEN_PROGRESS'] : []),
    ...(studentAssignmentContract.hasGenericActions ? ['GENERIC_ACTION_LABELS'] : []),
  ];
  const result = {
    status:
      overflowFailures.length === 0 &&
      keyboardFailures.length === 0 &&
      citationFailures.length === 0 &&
      studentForbiddenNavigation.length === 0 &&
      assignmentContractFailures.length === 0 &&
      Object.values(runtimeErrors).every(
        (entry) =>
          entry.exceptions === 0 && entry.consoleErrors === 0 && entry.failedRequests === 0,
      )
        ? 'PASS'
        : 'FAIL',
    chrome: version.Browser,
    baseUrl,
    audits,
    runtimeErrors,
    overflowFailures,
    keyboardFailures,
    citationFailures,
    studentForbiddenNavigation,
    assignmentContractFailures,
    studentAssignmentContract,
  };
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `${JSON.stringify({
      status: result.status,
      chrome: result.chrome,
      resultPath,
      screenshots: Object.keys(audits).length,
      overflowFailures,
      keyboardFailures,
      citationFailures,
      studentForbiddenNavigation,
      assignmentContractFailures,
      runtimeErrors,
    })}\n`,
  );
  if (result.status !== 'PASS') process.exitCode = 1;
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
