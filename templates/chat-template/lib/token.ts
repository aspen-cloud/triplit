import * as jwt from "jose"

export async function signToken(token: any, secret: string) {
  const alg = "HS256"
  const secretKey = new TextEncoder().encode(secret)
  const encodedToken = await new jwt.SignJWT(token)
    .setIssuedAt()
    .setExpirationTime("24h")
    .setProtectedHeader({ alg })
    .sign(secretKey)
  return encodedToken
}

export async function decodeToken(token: string, secret: string) {
  const secretKey = new TextEncoder().encode(secret)
  const decodedToken = await jwt.jwtVerify(token, secretKey, {
    algorithms: ["HS256"],
  })
  return decodedToken.payload
}
