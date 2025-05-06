import { describe, it, expect } from 'vitest';
import { decodeJwt } from '../src/token';
import * as jose from 'jose';

export async function encodeToken(
  payload: any,
  symSecret: string,
  exp?: number
) {
  let token = new jose.SignJWT(payload).setProtectedHeader({ alg: 'HS256' });
  if (exp) {
    token = token.setExpirationTime(exp);
  }
  return await token.sign(new TextEncoder().encode(symSecret));
}

describe('decodeToken', () => {
  it('handles undefined', () => {
    const result = decodeJwt(undefined);
    expect(result).toBeUndefined();
  });
  it('handles null', () => {
    const result = decodeJwt(null);
    expect(result).toBeUndefined();
  });
  it('handles empty string', () => {
    const result = decodeJwt('');
    expect(result).toBeUndefined();
  });
  it('non JWT string', () => {
    const result = decodeJwt('not a jwt');
    expect(result).toBeUndefined();
  });
  it('handles malformed JWT', () => {
    const result = decodeJwt('malformed.jwt.token');
    expect(result).toBeUndefined();
  });
  it('handles valid JWT', async () => {
    const token = await encodeToken({ foo: 'bar' }, 'test-secret');
    const result = decodeJwt(token);
    expect(result).toEqual({ foo: 'bar' });
  });
});
