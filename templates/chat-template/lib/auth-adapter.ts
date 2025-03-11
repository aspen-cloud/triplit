import { schema } from "@/triplit/schema.js"
import { TriplitAdapter } from "@triplit/authjs-adapter"

export const adapter = TriplitAdapter({
  serverUrl: process.env.TRIPLIT_DB_URL!,
  token: process.env.TRIPLIT_SERVICE_TOKEN!,
  schema: schema,
})
