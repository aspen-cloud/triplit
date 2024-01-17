import { hashPassword } from "@/lib/crypt.js"

export async function POST(request: Request) {
  const { username, password, email } = await request.json()

  const userCheckResponse = await fetch(process.env.TRIPLIT_DB_URL + "/fetch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + process.env.TRIPLIT_SERVICE_TOKEN,
    },
    body: JSON.stringify({
      query: {
        collectionName: "users",
        where: [["user", "=", username]],
        limit: 1,
      },
    }),
  })
  const userCheck = await userCheckResponse.json()
  if (userCheck.length > 0) {
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
  const res = await fetch(process.env.TRIPLIT_DB_URL + "/bulk-insert", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + process.env.TRIPLIT_SERVICE_TOKEN,
    },
    body: JSON.stringify({
      credentials: [credential],
      users: [user],
    }),
  })
  const result = await res.json()
  return Response.json({ result }, { status: 200 })
}
