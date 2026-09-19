export const apiUrl = '/backend';

export function apiPath(path: string): string {
  return `${apiUrl}${path.startsWith('/') ? path : `/${path}`}`;
}
