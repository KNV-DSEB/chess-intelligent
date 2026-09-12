const shaPattern = /^[a-f0-9]{40}$/u;
const sensitivePublicName = /(cookie|database|key|password|secret|session|smtp|token)/iu;

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the Pilot Web build.`);
  return value;
}

function exactHttpsOrigin(name) {
  const raw = required(name);
  const url = new URL(raw);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.pathname !== '' && url.pathname !== '/') ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${name} must be one credential-free HTTPS origin with no path/query/hash.`);
  }
  return url.origin;
}

for (const name of Object.keys(process.env)) {
  if (name.startsWith('NEXT_PUBLIC_') && sensitivePublicName.test(name)) {
    throw new Error(`${name} has a secret-like name and must not be exposed to the browser.`);
  }
}

const apiOrigin = exactHttpsOrigin('NEXT_PUBLIC_API_URL');
const expectedSha = required('PILOT_RELEASE_SHA').toLowerCase();
if (!shaPattern.test(expectedSha)) {
  throw new Error('PILOT_RELEASE_SHA must be one full lowercase Git SHA.');
}

const actualSha = process.env.VERCEL_GIT_COMMIT_SHA?.trim().toLowerCase();
if (!actualSha) {
  throw new Error(
    'VERCEL_GIT_COMMIT_SHA is required; enable Vercel system environment variables for release evidence.',
  );
}
if (!shaPattern.test(actualSha) || actualSha !== expectedSha) {
  throw new Error('The Vercel build Git SHA does not match PILOT_RELEASE_SHA.');
}

process.stdout.write(
  `${JSON.stringify({ status: 'PILOT_WEB_BUILD_BOUNDARY_VERIFIED', releaseSha: actualSha, apiOrigin })}\n`,
);
