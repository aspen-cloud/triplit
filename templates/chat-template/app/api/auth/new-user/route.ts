import { HttpClient } from "@triplit/client"

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

  const hashedPassword = await hashPassword(password)

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
  const result = await client.bulkInsert({
    credentials: [credential],
    users: [user],
  })

  return Response.json(result, { status: 200 })
}
