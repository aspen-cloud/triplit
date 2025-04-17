import { schema } from "@/triplit/schema.js"
import { TriplitClient } from "@triplit/client"
import { IndexedDbKVStore } from "@triplit/client/storage/indexed-db"

const isClient = typeof window !== "undefined"

// On client use IndexedDB, fallback to default on server
const storage = isClient
  ? new IndexedDbKVStore("triplit-chat-template")
  : undefined

export const client = new TriplitClient({
  schema,
  serverUrl: process.env.NEXT_PUBLIC_TRIPLIT_SERVER,
  autoConnect: false,
  storage,
})

// @ts-expect-error
if (isClient) window.client = client

export const Query = client.query
