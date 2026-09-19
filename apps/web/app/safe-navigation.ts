export function safeReturnTo(value: string | null | undefined, fallback = '/my'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback;

  let decoded = value;
  try {
    for (let pass = 0; pass < 2; pass += 1) {
      decoded = decodeURIComponent(decoded);
      if (
        [...decoded].some((character) => {
          const codePoint = character.codePointAt(0) ?? 0;
          return character === '\\' || codePoint <= 0x1f || codePoint === 0x7f;
        })
      ) {
        return fallback;
      }
    }
  } catch {
    return fallback;
  }

  const applicationOrigin = 'https://chess-intelligent.invalid';
  const target = new URL(value, applicationOrigin);
  if (target.origin !== applicationOrigin) return fallback;
  if (/^\/(?:login|signup)(?:\/|$)/u.test(target.pathname)) return fallback;
  return `${target.pathname}${target.search}${target.hash}`;
}

export function withReturnTo(path: '/login' | '/signup', returnTo: string): string {
  return `${path}?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`;
}
