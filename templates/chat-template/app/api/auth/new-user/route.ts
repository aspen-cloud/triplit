import { HttpClient } from "@triplit/client"

import { createCredentailAndUser } from "@/lib/create-user.js"
import { hashPassword } from "@/lib/crypt.js"

const client = new HttpClient({
  serverUrl: process.env.TRIPLIT_DB_URL,
  token: process.env.TRIPLIT_SERVICE_TOKEN,
})

export async function POST(request: Request) {
  const { username, password, email } = await request.json()

  const userCheck = await client.fetchOne({
    collectionName: "users",
    where: [["name", "=", username]],
  })

  if (userCheck) {
    return Response.json({ message: "User already exists" }, { status: 422 })
  }

  const { credential, user } = await createCredentailAndUser({
    username,
    password,
    email,
  })

  const result = await client.bulkInsert({
    credentials: [credential],
    users: [user],
  })

  return Response.json(result, { status: 200 })
}
