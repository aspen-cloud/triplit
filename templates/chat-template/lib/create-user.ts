import { hashPassword } from "./crypt.js"

export async function createCredentailAndUser(payload: {
  username: string
  password: string
  email: string
}) {
  const { username, password, email } = payload
  const hashedPassword = await hashPassword(password)

  // Create id for user so it can be used on the credential
  const id = crypto.randomUUID()

  const credential = {
    userId: id,
    username,
    password: hashedPassword,
  }

  const user = {
    id,
    name: username,
    email,
  }

  return { credential, user }
}
