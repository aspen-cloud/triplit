import { MessageCircle } from "lucide-react"

export default function ConversationId() {
  return (
    <section className="grow">
      <div className="flex max-w-[980px] w-full h-screen flex-col items-center justify-center text-muted-foreground gap-2 p-10">
        <div className="flex flex-row gap-2">
          <MessageCircle className="w-5 h-5" />
          No conversation selected
        </div>
      </div>
    </section>
  )
}
