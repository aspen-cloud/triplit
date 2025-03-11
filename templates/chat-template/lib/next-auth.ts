import { JWTDecodeParams, JWTEncodeParams } from "next-auth/jwt"

import { decodeToken, signToken } from "./token.js"

// Exported for middleware use
export async function jwtDecode({ secret, token }: JWTDecodeParams) {
  return await decodeToken(token!, secret as string)
}

export async function jwtEncode({ secret, token }: JWTEncodeParams) {
  return await signToken(token, secret as string)
}
