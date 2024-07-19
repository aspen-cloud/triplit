import { schema } from "@/triplit/schema.js"
import { TriplitClient } from "@triplit/client"

export const client = new TriplitClient({
  schema,
  serverUrl: process.env.NEXT_PUBLIC_TRIPLIT_SERVER,
  autoConnect: false,
})

// @ts-ignore
if (typeof window !== "undefined") window.client = client
