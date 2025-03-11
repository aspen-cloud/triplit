import { BulkInsert } from "@triplit/client"

import { schema } from "../schema.js"
import {
  generateAuthData,
  generateConversations,
  generateMessages,
} from "../seed-utils.js"

export default async function seed(): Promise<BulkInsert<typeof schema>> {
  // Generate user data
  const { users: knownUsers, credentials: knownCredentials } =
    await generateAuthData(["alice", "bob", "charlie"])
  const { users: extraUsers, credentials: extraCredentials } =
    await generateAuthData(10)
  const users = [...knownUsers, ...extraUsers]
  const credentials = [...knownCredentials, ...extraCredentials]

  // Generate conversation and message data
  const knownUserConversaiton = generateConversations(
    1,
    {
      members: new Set(["alice", "bob", "charlie"]),
    },
    {}
  )
  const extraConversations = generateConversations(
    10,
    {},
    { users, minGroupSize: 2, maxGroupSize: 5 }
  )
  const conversations = [...knownUserConversaiton, ...extraConversations]
  const messages = generateMessages(1000, {}, { conversations })
  return {
    messages: messages,
    conversations: conversations,
    credentials,
    users,
  }
}
