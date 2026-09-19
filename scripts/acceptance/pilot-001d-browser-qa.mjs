import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const baseUrl = process.env.PILOT001D_BASE_URL ?? 'http://127.0.0.1:3000';
const outputDirectory =
  process.env.PILOT001D_SCREENSHOT_DIR ?? '.impeccable/review/pilot-001d-final';
const resultPath =
  process.env.PILOT001D_BROWSER_RESULT ?? '.impeccable/review/pilot-001d-final/browser-qa.json';
const chromePath =
  process.env.PILOT001D_CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

class CdpClient {
  constructor(socketUrl) {
    this.socket = new WebSocket(socketUrl);
    this.nextId = 0;
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result);
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

  async createContext() {
    const { browserContextId } = await this.command('Target.createBrowserContext');
    const { targetId } = await this.command('Target.createTarget', {
      url: 'about:blank',
      browserContextId,
    });
    const { sessionId } = await this.command('Target.attachToTarget', {
      targetId,
      flatten: true,
    });
    await Promise.all(
      ['Page.enable', 'Runtime.enable', 'Network.enable'].map((method) =>
        this.command(method, {}, sessionId),
      ),
    );
    return { browserContextId, targetId, sessionId };
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
  if (result.exceptionDetails) throw new Error(`Browser evaluation failed: ${expression}`);
  return result.result.value;
}

async function waitFor(context, expression, label, timeout = 25_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(context, `Boolean(${expression})`)) return;
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${label}.`);
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
  await waitFor(context, `document.readyState !== 'loading'`, pathname);
  await waitFor(context, `document.querySelector('.public-navigation')`, 'public navigation');
  await delay(250);
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
  return evaluate(
    context,
    `(() => {
      const control = document.querySelector('main a[href], main button:not([disabled]), main input:not([disabled])');
      control?.focus({ preventScroll: true });
      const active = document.activeElement;
      const rect = active?.getBoundingClientRect();
      return Boolean(active && active !== document.body && rect && rect.width >= 24 && rect.height >= 24);
    })()`,
  );
}

async function capture(context, { page, pathname, width, height, suffix }) {
  await setViewport(context, width, height);
  await goto(context, pathname);
  const audit = await evaluate(
    context,
    `(() => {
      const root = document.documentElement;
      const isLanding = location.pathname === '/';
      const heading = document.querySelector('main h1');
      const primary = document.querySelector('.landing-primary');
      const proof = innerWidth < 600
        ? document.querySelector('.mobile-evidence-cue')
        : document.querySelector('.dossier-preview');
      const form = document.querySelector('.stacked-form');
      const inputs = [...document.querySelectorAll('.stacked-form input')];
      const rect = (element) => element ? element.getBoundingClientRect() : null;
      const inputRects = inputs.map(rect);
      return {
        heading: heading?.textContent?.trim() ?? null,
        viewport: { width: innerWidth, height: innerHeight },
        documentWidth: root.scrollWidth,
        horizontalOverflow: root.scrollWidth > innerWidth + 1,
        primaryInFirstViewport: !primary || (rect(primary).top >= 0 && rect(primary).bottom <= innerHeight),
        proofVisible: !isLanding || Boolean(proof && getComputedStyle(proof).display !== 'none'),
        proofWithinWidth: !isLanding || (rect(proof).left >= 0 && rect(proof).right <= innerWidth + 1),
        proofStartsInFirstViewport: !isLanding || rect(proof).top < innerHeight,
        formWithinWidth: !form || (rect(form).left >= 0 && rect(form).right <= innerWidth + 1),
        inputsWithinWidth: inputRects.every((input) => input.left >= 0 && input.right <= innerWidth + 1),
        signupErrorSemantics: location.pathname !== '/signup' || ['displayName', 'email', 'password', 'confirmation'].every((name) => {
          const input = document.querySelector('[name="' + name + '"]');
          return Boolean(input?.id && input.hasAttribute('aria-invalid'));
        }),
      };
    })()`,
  );
  audit.keyboard = await keyboardSmoke(context);
  await evaluate(context, `document.activeElement?.blur(); scrollTo(0, 0); true`);
  audit.screenshot = await screenshot(context, `${page}-${suffix}-rc9`);
  return audit;
}

await mkdir(outputDirectory, { recursive: true });
await mkdir(path.dirname(resultPath), { recursive: true });
const profileDirectory = await mkdtemp(path.join(tmpdir(), 'pilot001d-chrome-'));
const debuggingPort = Number(process.env.PILOT001D_DEBUGGING_PORT ?? 9352);
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
  const context = await client.createContext();
  const audits = {};
  for (const viewport of [
    { width: 1440, height: 900, suffix: '1440x900' },
    { width: 1024, height: 768, suffix: '1024x768' },
    { width: 390, height: 844, suffix: '390x844' },
  ]) {
    audits[`landing-${viewport.suffix}`] = await capture(context, {
      page: 'landing',
      pathname: '/',
      ...viewport,
    });
    audits[`signup-${viewport.suffix}`] = await capture(context, {
      page: 'signup',
      pathname: '/signup',
      ...viewport,
    });
  }

  const failures = Object.entries(audits)
    .filter(([, audit]) =>
      [
        audit.horizontalOverflow,
        !audit.primaryInFirstViewport,
        !audit.proofVisible,
        !audit.proofWithinWidth,
        !audit.proofStartsInFirstViewport,
        !audit.formWithinWidth,
        !audit.inputsWithinWidth,
        !audit.signupErrorSemantics,
        !audit.keyboard,
      ].some(Boolean),
    )
    .map(([name]) => name);
  const result = {
    status: failures.length === 0 ? 'PASS' : 'FAIL',
    chrome: version.Browser,
    baseUrl,
    audits,
    failures,
  };
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `${JSON.stringify({ status: result.status, chrome: result.chrome, resultPath, failures })}\n`,
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
