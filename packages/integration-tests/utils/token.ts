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
