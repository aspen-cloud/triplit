import { client } from "@/lib/triplit.js"

// Creates a new conversation with the current user as the only member
async function addConversation(name: string, currentUserId: string) {
  return client.insert("conversations", {
    name,
    members: new Set([currentUserId]),
  })
}

// Adds a user to an existing conversation, using the Triplit update API which supports
// set operations for set attributes as defined by a collection's schema.
async function addUserToConversation(userId: string, conversationId: string) {
  await client.update("conversations", conversationId, ({ members }) => {
    members.add(userId)
  })
}

// Remove a user from an existing conversation.
async function removeUserFromConversation(
  userId: string,
  conversationId: string
) {
  await client.update("conversations", conversationId, ({ members }) => {
    members.delete(userId)
  })
}

export { addConversation, addUserToConversation, removeUserFromConversation }
