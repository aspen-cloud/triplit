import { Conversation } from "@/components/conversation.js"

export default function ConversationPage({
  params,
}: {
  params: { conversationId: string }
}) {
  return (
    <section className="h-full">
      <Conversation id={params.conversationId} />
    </section>
  )
}
