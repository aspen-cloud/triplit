import { faker } from "@faker-js/faker"
import { Entity, WriteModel } from "@triplit/client"

import { createCredentailAndUser } from "@/lib/create-user.js"

import { schema } from "./schema.js"

export type User = Entity<typeof schema, "users">
export type UserInput = WriteModel<typeof schema, "users">
export type Credential = Entity<typeof schema, "credentials">
export type CredentialInput = WriteModel<typeof schema, "credentials">
export type Conversation = Entity<typeof schema, "conversations">
export type ConversationInput = WriteModel<typeof schema, "conversations">
export type Message = Entity<typeof schema, "messages">
export type MessageInput = WriteModel<typeof schema, "messages">

export async function generateAuthData(usersInput: number | string[]) {
  const nUsers = typeof usersInput === "number" ? usersInput : usersInput.length
  const users: User[] = []
  const credentials: CredentialInput[] = []

  for (let i = 0; i < nUsers; i++) {
    const username =
      typeof usersInput === "number" ? faker.person.firstName() : usersInput[i]
    const email = faker.internet.email()
    const password = "password"

    const { credential, user } = await createCredentailAndUser({
      username,
      email,
      password,
    })

    users.push(user)
    credentials.push(credential)
  }
  return { users, credentials }
}

export function generateConversations(
  n: number,
  overrides: Partial<ConversationInput> = {},
  context: { users?: UserInput[]; minGroupSize?: number; maxGroupSize?: number }
): ConversationInput[] {
  // @ts-expect-error TODO: improve some typing here related to Read and Write models
  return Array.from({ length: n }, () => ({
    id: faker.string.uuid(),
    name: faker.lorem.word(),
    members: context.users
      ? new Set(
          faker.helpers
            .arrayElements(context.users, {
              min: context.minGroupSize ?? 2,
              max: context.maxGroupSize ?? 5,
            })
            .map((user) => user.id)
        )
      : new Set(),
    ...overrides,
  }))
}

export function generateMessages(
  n: number,
  overrides: Partial<Message> = {},
  context: { conversations: ConversationInput[] }
): Message[] {
  return Array.from({ length: n }, () => {
    const group = faker.helpers.arrayElement(context.conversations)
    const conversationId = group?.id
    const sender_id = faker.helpers.arrayElement(
      Array.from(group.members ?? [])
    )
    return {
      id: faker.string.uuid(),
      conversationId: conversationId ?? faker.string.uuid(),
      sender_id: sender_id ?? faker.string.uuid(),
      text: faker.lorem.sentence(),
      created_at: faker.date.recent().toISOString(),
      likes: new Set(),
      ...overrides,
    }
  })
}
