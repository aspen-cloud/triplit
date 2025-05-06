/**
 * Decodes a JWT token and returns the claims area.
 * If no value is found or an error occurs while decoding (due to an invalid jwt), it returns undefined.
 */
export function decodeToken(token: unknown, claimsPath?: string) {
  const decoded = decodeJwt(token);
  if (!decoded) return undefined;
  const pathList = claimsPath?.split('.') ?? [];
  const claimsArea = pathList.reduce<Record<string, unknown> | undefined>(
    (acc, curr) => {
      if (acc && acc[curr]) {
        return acc[curr] as Record<string, unknown>;
      }
      return undefined;
    },
    decoded
  );
  return claimsArea;
}

export function decodeJwt(token: unknown): Record<string, unknown> | undefined {
  if (typeof token !== 'string') return undefined;

  const parts = token.split('.');
  if (parts.length !== 3) return undefined;

  // Convert base64url to base64 and pad to length multiple of 4
  const base64url = parts[1];
  const base64 = base64url
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(base64url.length / 4) * 4, '=');

  try {
    const json =
      typeof atob === 'function'
        ? atob(base64) // browser
        : Buffer.from(base64, 'base64').toString('binary');

    const utf8 = decodeURIComponent(
      Array.from(
        json,
        (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')
      ).join('')
    );

    return JSON.parse(utf8) as Record<string, unknown>;
  } catch {
    // return undefined if decoding fails
    return undefined;
  }
}

export function tokenIsExpired(token: Record<string, any>) {
  if (token.exp === undefined) return false;
  return token.exp * 1000 < Date.now();
}
