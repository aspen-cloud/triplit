import { hashPassword } from "@/lib/crypt.js";
import { TriplitClient } from '@triplit/client';

const client = new TriplitClient({
  serverUrl: process.env.TRIPLIT_DB_URL,
  token: process.env.TRIPLIT_SERVICE_TOKEN,
});

export async function POST(request: Request) {
  const { username, password, email } = await request.json();

  console.log("envs", process.env.TRIPLIT_DB_URL, process.env.TRIPLIT_SERVICE_TOKEN);

  const userCheck = await client.http.fetchOne({
    collectionName: "users",
    where: [["name", "=", username]],
  });

  if (userCheck) {
    return Response.json({ message: "User already exists" }, { status: 422 });
  }

  const hashedPassword = await hashPassword(password);

  const id = crypto.randomUUID();

  const credential = {
    userId: id,
    username,
    password: hashedPassword,
  };

  const user = {
    id,
    name: username,
    email,
  };

  const { txId: credentialTxId } = await client.http.insert("credentials", credential);
  const { txId: userTxId, output: userOutput } = await client.http.insert("users", user);

  return Response.json({ credentialTxId, userTxId, user: userOutput }, { status: 200 });
}
