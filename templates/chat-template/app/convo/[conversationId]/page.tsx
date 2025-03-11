"use client"

import { useParams } from "next/navigation.js"

import { Conversation } from "@/components/conversation.js"

export default function ConversationPage() {
  const params = useParams<{ conversationId: string }>()
  return (
    <section className="h-full">
      <Conversation id={params.conversationId} />
    </section>
  )
}
