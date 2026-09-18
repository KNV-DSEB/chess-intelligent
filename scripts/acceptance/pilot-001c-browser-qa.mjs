import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const baseUrl = process.env.PILOT001C_BASE_URL ?? 'http://127.0.0.1:3000';
const fixturePath = process.env.PILOT001C_FIXTURE_PATH ?? '.tmp-task-pilot001c/fixture.json';
const outputDirectory =
  process.env.PILOT001C_SCREENSHOT_DIR ?? '.impeccable/review/pilot-001c-baseline';
const resultPath =
  process.env.PILOT001C_BROWSER_RESULT ?? '.tmp-task-pilot001c/baseline-browser.json';
const chromePath =
  process.env.PILOT001C_CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));

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
    throw new Error(`Browser evaluation failed in ${context.name}: ${expression.slice(0, 120)}`);
  }
  return result.result.value;
}

async function waitFor(context, expression, label, timeout = 25_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(context, `Boolean(${expression})`)) return;
    await delay(150);
  }
  const diagnostic = await evaluate(
    context,
    `({ path: location.pathname, text: document.body?.innerText?.slice(0, 500) ?? '', ready: document.readyState })`,
  ).catch(() => null);
  throw new Error(`${context.name} timed out waiting for ${label}. ${JSON.stringify(diagnostic)}`);
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
      mobile: width < 600,
      scale: 1,
    },
    context.sessionId,
  );
}

async function goto(context, pathname) {
  await client.command('Page.navigate', { url: `${baseUrl}${pathname}` }, context.sessionId);
  await waitFor(context, `document.readyState !== 'loading'`, `navigation ${pathname}`);
  await delay(450);
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

async function login(context, identity) {
  await goto(context, '/login');
  await waitFor(context, `document.querySelector('form[data-hydrated="true"]')`, 'login form');
  await setValue(context, 'input[name="email"]', identity.email);
  await setValue(context, 'input[name="password"]', identity.password);
  await evaluate(context, `document.querySelector('form').requestSubmit(); true`);
  await waitFor(context, `location.pathname === '/my'`, 'successful login');
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
      return Boolean(first);
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
      if (!active || active === document.body) return false;
      const rect = active.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    })()`,
  );
}

async function capture(context, input) {
  await setViewport(context, input.width, input.height);
  if (input.pathname) await goto(context, input.pathname);
  if (input.ready) await waitFor(context, input.ready, input.name);
  const keyboard = await keyboardSmoke(context);
  if (input.beforeCapture) await input.beforeCapture();
  await delay(250);
  const audit = await evaluate(
    context,
    `(() => {
      const root = document.documentElement;
      return {
        heading: document.querySelector('main h1')?.textContent?.trim() ?? null,
        horizontalOverflow: root.scrollWidth > innerWidth + 1,
        documentWidth: root.scrollWidth,
        viewport: { width: innerWidth, height: innerHeight }
      };
    })()`,
  );
  audit.keyboard = keyboard;
  audit.screenshot = await screenshot(context, input.name);
  return audit;
}

function scrollTo(context, selector) {
  return evaluate(
    context,
    `document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({ block: 'start' }); true`,
  );
}

async function clickByText(context, selector, text) {
  await evaluate(
    context,
    `(() => {
      const item = [...document.querySelectorAll(${JSON.stringify(selector)})]
        .find((candidate) => candidate.textContent?.includes(${JSON.stringify(text)}));
      if (!item) throw new Error('Missing labeled control');
      item.click();
      return true;
    })()`,
  );
}

await mkdir(outputDirectory, { recursive: true });
await mkdir(path.dirname(resultPath), { recursive: true });
const profileDirectory = await mkdtemp(path.join(tmpdir(), 'pilot001c-chrome-'));
const debuggingPort = Number(process.env.PILOT001C_DEBUGGING_PORT ?? 9351);
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
  for (let attempt = 0; attempt < 60; attempt += 1) {
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
  const [anonymous, coach, student] = await Promise.all(
    ['ANONYMOUS', 'COACH', 'STUDENT'].map((name) => client.createContext(name)),
  );
  await login(coach, fixture.identities.coach);
  await login(student, fixture.identities.student);

  const coachHome = `/academy?academyId=${fixture.academyId}`;
  const intelligence = `/academy/students/${fixture.studentProfileId}?academyId=${fixture.academyId}`;
  const assignment = `/academy/assignments/${fixture.assignmentId}?academyId=${fixture.academyId}`;
  const studentHome = `/academy/${fixture.academyId}/my`;
  const uncompletedItem = fixture.trainingItems[1] ?? fixture.trainingItems[0];
  const trainingItem = `/training?item=${uncompletedItem.id}`;
  const audits = {};

  for (const viewport of [
    { width: 1440, height: 900, suffix: '1440x900' },
    { width: 1024, height: 768, suffix: '1024x768' },
    { width: 390, height: 844, suffix: '390x844' },
  ]) {
    const suffix = viewport.suffix;
    audits[`login-${suffix}`] = await capture(anonymous, {
      ...viewport,
      pathname: '/login',
      ready: `document.querySelector('form[data-hydrated="true"]')`,
      name: `login-${suffix}`,
    });
    audits[`coach-home-${suffix}`] = await capture(coach, {
      ...viewport,
      pathname: coachHome,
      ready: `document.querySelector('.academy-context-form')`,
      beforeCapture: async () => {
        const hasRoster = await evaluate(
          coach,
          `document.querySelectorAll('.academy-student-card').length >= 3`,
        );
        if (!hasRoster) {
          await evaluate(
            coach,
            `(() => { document.querySelector('.academy-context-form')?.requestSubmit(); return true; })()`,
          );
          await waitFor(
            coach,
            `document.querySelectorAll('.academy-student-card').length >= 3`,
            `coach-home-${suffix}-roster`,
          );
        }
      },
      name: `coach-home-${suffix}`,
    });
    audits[`student-intelligence-${suffix}`] = await capture(coach, {
      ...viewport,
      pathname: intelligence,
      ready: `document.querySelector('.learning-intelligence')`,
      name: `student-intelligence-${suffix}`,
    });
    audits[`skill-map-${suffix}`] = await capture(coach, {
      ...viewport,
      pathname: intelligence,
      ready: `document.querySelector('.skill-map')`,
      beforeCapture: () => scrollTo(coach, '.skill-map'),
      name: `skill-map-${suffix}`,
    });
    audits[`evidence-${suffix}`] = await capture(coach, {
      ...viewport,
      pathname: intelligence,
      ready: `document.querySelector('.priority-row button')`,
      beforeCapture: async () => {
        await clickByText(coach, 'button', 'Inspect evidence');
        await waitFor(coach, `document.querySelector('.evidence-drawer')`, 'evidence detail');
        await scrollTo(coach, '.evidence-drawer');
      },
      name: `evidence-${suffix}`,
    });
    audits[`plan-creation-${suffix}`] = await capture(coach, {
      ...viewport,
      pathname: intelligence,
      ready: `document.querySelector('.academy-assignment-form')`,
      beforeCapture: () => scrollTo(coach, '.academy-assignment-form'),
      name: `plan-creation-${suffix}`,
    });
    audits[`assignment-${suffix}`] = await capture(coach, {
      ...viewport,
      pathname: assignment,
      ready: `document.querySelector('.academy-assignment-items')`,
      name: `assignment-${suffix}`,
    });
    audits[`coach-progress-${suffix}`] = await capture(coach, {
      ...viewport,
      pathname: intelligence,
      ready: `[...document.querySelectorAll('button:not([disabled])')].some((button) => button.textContent?.includes('Compare baseline'))`,
      beforeCapture: async () => {
        await clickByText(coach, 'button', 'Compare baseline');
        await waitFor(coach, `document.querySelector('.academy-progress')`, 'coach progress');
        await scrollTo(coach, '.academy-progress');
      },
      name: `coach-progress-${suffix}`,
    });
    audits[`student-home-${suffix}`] = await capture(student, {
      ...viewport,
      pathname: studentHome,
      ready: `document.querySelector('.student-training-first')`,
      name: `student-home-${suffix}`,
    });
    audits[`student-assignment-${suffix}`] = await capture(student, {
      ...viewport,
      pathname: studentHome,
      ready: `document.querySelector('.student-training-first')`,
      beforeCapture: () => scrollTo(student, '.student-training-first'),
      name: `student-assignment-${suffix}`,
    });
    audits[`training-item-${suffix}`] = await capture(student, {
      ...viewport,
      pathname: trainingItem,
      ready: `document.querySelector('.training-solver form')`,
      beforeCapture: () => scrollTo(student, '.training-solver'),
      name: `training-item-${suffix}`,
    });
    audits[`student-progress-${suffix}`] = await capture(student, {
      ...viewport,
      pathname: studentHome,
      ready: `document.querySelector('#progress .learning-intelligence')`,
      beforeCapture: () => scrollTo(student, '#progress'),
      name: `student-progress-${suffix}`,
    });
  }

  await setViewport(coach, 1440, 900);
  await goto(coach, intelligence);
  await waitFor(coach, `document.querySelector('.grounded-brief button')`, 'optional AI surface');
  await evaluate(
    coach,
    `(() => { document.querySelector('.grounded-brief').open = true; return true; })()`,
  );
  await clickByText(coach, '.grounded-brief button', 'Create evidence-backed explanation');
  await waitFor(coach, `document.querySelector('.ai-unavailable')`, 'AI disabled fallback');
  await scrollTo(coach, '.grounded-brief');
  audits['ai-disabled-1440x900'] = await capture(coach, {
    width: 1440,
    height: 900,
    name: 'ai-disabled-1440x900',
  });

  const runtimeErrors = Object.fromEntries(
    [anonymous, coach, student].map((context) => [
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
    .filter(([, audit]) => !audit.keyboard)
    .map(([name]) => name);
  const result = {
    status:
      overflowFailures.length === 0 &&
      keyboardFailures.length === 0 &&
      Object.values(runtimeErrors).every(
        (entry) =>
          entry.exceptions === 0 && entry.consoleErrors === 0 && entry.failedRequests === 0,
      )
        ? 'PASS'
        : 'FAIL',
    chrome: version.Browser,
    baseUrl,
    fixture: {
      academyId: fixture.academyId,
      studentProfileId: fixture.studentProfileId,
      assignmentId: fixture.assignmentId,
    },
    audits,
    overflowFailures,
    keyboardFailures,
    runtimeErrors,
  };
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `${JSON.stringify({
      status: result.status,
      chrome: result.chrome,
      screenshots: Object.keys(audits).length,
      resultPath,
      overflowFailures,
      keyboardFailures,
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
