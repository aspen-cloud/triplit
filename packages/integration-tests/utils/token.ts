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

export const SERVICE_TOKEN_PAYLOAD = Object.freeze({
  'x-triplit-token-type': 'secret',
});
export const ANON_TOKEN_PAYLOAD = Object.freeze({
  'x-triplit-token-type': 'anon',
});

export function generateServiceToken(symSecret: string) {
  return encodeToken(SERVICE_TOKEN_PAYLOAD, symSecret);
}

export function generateAnonToken(symSecret: string) {
  return encodeToken(ANON_TOKEN_PAYLOAD, symSecret);
}
