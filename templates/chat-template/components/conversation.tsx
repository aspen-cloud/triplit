"use client"

import { ChangeEvent, useMemo, useState } from "react"
import { useConnectionStatus } from "@triplit/react"
import {
  CheckCircle,
  CircleIcon,
  CloudOff,
  SendIcon,
  Users,
} from "lucide-react"
import { useSession } from "next-auth/react"

import { client } from "@/lib/triplit.js"
import { cn } from "@/lib/utils.js"
import {
  useConversation,
  useMessages,
  type Message,
} from "@/hooks/triplit-hooks.js"

import { SearchUsers } from "./search-users.jsx"
import { Button } from "./ui/button.jsx"
import { Input } from "./ui/input.jsx"

export function Conversation({ id }: { id: string }) {
  return (
    <div className="flex h-full flex-col items-stretch overflow-hidden">
      <ConversationHeader convoId={id} />
      <MessageList convoId={id} />
      <MessageInput convoId={id} />
    </div>
  )
}

function ConversationHeader({ convoId }: { convoId: string }) {
  const { conversation } = useConversation(convoId)
  const connectionStatus = useConnectionStatus(client)
  const [memberModalOpen, setMemberModalOpen] = useState(false)

  return (
    <div className="border-b p-3 text-lg">
      <div className="flex items-center  justify-between gap-1">
        <div className="text-2xl">{conversation && conversation.name}</div>
        {!connectionStatus ||
          (connectionStatus === "CLOSED" && (
            <div className=" border px-3 py-2 rounded-full text-sm flex gap-2 items-center">
              <CloudOff className="w-3.5 h-3.5" /> Offline
            </div>
          ))}
        <Button
          size="icon"
          variant="outline"
          onClick={() => {
            setMemberModalOpen((prev) => !prev)
          }}
        >
          <Users className="w-5 h-5" />
        </Button>
      </div>
      {conversation && (
        <SearchUsers
          conversation={conversation}
          open={memberModalOpen}
          setOpen={setMemberModalOpen}
        />
      )}
    </div>
  )
}

function MessageInput({ convoId }: { convoId: string }) {
  const { data: session } = useSession()
  const [draftMsg, setDraftMsg] = useState("")

  return (
    <div>
      <form
        onSubmit={(e) => {
          if (!session) return
          e.preventDefault()
          client
            .insert("messages", {
              conversationId: convoId,
              text: draftMsg,
              sender_id: session.user.id,
            })
            .then(() => {
              setDraftMsg("")
            })
        }}
        className="flex items-center justify-center gap-4 p-5"
      >
        <Input
          value={draftMsg}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setDraftMsg(e.target.value)
          }}
          className="max-w-2xl"
          placeholder="Type your message"
        />
        <Button
          type="submit"
          size="icon"
          className="h-10"
          disabled={draftMsg.length === 0}
        >
          <SendIcon className="h-5 w-5" />
        </Button>
      </form>
    </div>
  )
}

function MessageList({ convoId }: { convoId: string }) {
  const { data: session } = useSession()
  const {
    messages,
    pendingMessages,
    error: messagesError,
    fetching: isFetchingMessages,
  } = useMessages(convoId)

  const messageArray = useMemo(() => {
    if (!messages) return []
    return Array.from(messages).map(([_id, message]) => message)
  }, [messages])

  const pendingMessageArray = useMemo(() => {
    if (!pendingMessages) return []
    return Array.from(pendingMessages).map(([_id, message]) => message)
  }, [pendingMessages])

  return (
    <div className="flex grow flex-col-reverse gap-2 overflow-y-auto px-6 py-3 relative">
      {pendingMessageArray.map((message, index) => (
        <ChatBubble
          key={message.id}
          message={message}
          delivered={false}
          isOwnMessage={true}
          showSentIndicator={index === 0}
        />
      ))}
      {isFetchingMessages ? (
        <div>Loading...</div>
      ) : messagesError ? (
        <div>
          <h4>Could not load messages</h4>
          <p>Error: {messagesError.message}</p>
        </div>
      ) : (
        messageArray.map((message, index) => {
          const isOwnMessage = message.sender_id === session.user.id
          const isFirstMessageInABlockFromThisDay =
            index === messageArray.length - 1 ||
            new Date(
              messageArray[index + 1]?.created_at
            ).toLocaleDateString() !==
              new Date(message.created_at).toLocaleDateString()
          return (
            <>
              <ChatBubble
                key={message.id}
                message={message}
                delivered={true}
                isOwnMessage={isOwnMessage}
                showSentIndicator={index === 0}
              />
              {isFirstMessageInABlockFromThisDay && (
                <div
                  className="text-center text-sm text-muted-foreground"
                  key={message.created_at}
                >
                  {new Date(message.created_at).toLocaleDateString([], {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                </div>
              )}
            </>
          )
        })
      )}
    </div>
  )
}

function ChatBubble({
  message,
  delivered,
  isOwnMessage,
  showSentIndicator,
}: {
  message: Message
  delivered: boolean
  isOwnMessage: boolean
  showSentIndicator?: boolean
}) {
  return (
    <div className={cn(isOwnMessage && "self-end")}>
      <div
        className={cn(
          "text-secondary-foreground w-max rounded-lg px-4 py-3 flex flex-col gap-1",
          delivered ? "bg-secondary" : "border border-dashed",
          isOwnMessage && "items-end"
        )}
      >
        {!isOwnMessage && (
          <div className="text-sm font-bold">
            {message.sender.get(message.sender_id)?.name}
          </div>
        )}
        <div>{message.text}</div>
        <div className="text-xs text-muted-foregrounopenMemberModal">
          {new Date(message.created_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          })}
        </div>
      </div>
      {showSentIndicator && isOwnMessage && (
        <SentIndicator delivered={delivered} />
      )}
    </div>
  )
}

function SentIndicator({ delivered }: { delivered: boolean }) {
  return (
    <div className="flex flex-row items-center gap-1 text-xs justify-end p-2">
      {delivered ? (
        <>
          <CheckCircle size={12} />
          Sent
        </>
      ) : (
        <>
          <CircleIcon size={12} /> Pending
        </>
      )}
    </div>
  )
}
