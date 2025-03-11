import { useSession } from "next-auth/react"

import {
  addUserToConversation,
  removeUserFromConversation,
} from "@/lib/triplit-mutations.js"
import {
  Conversation,
  UseConversationResult,
  useUsersNotInConversationList,
} from "@/hooks/triplit-hooks.js"

import { Button } from "./ui/button.jsx"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command.jsx"

export function SearchUsers({
  open,
  setOpen,
  conversation,
}: {
  open: boolean
  setOpen: (open: boolean) => void
  conversation: UseConversationResult
}) {
  const { data: session } = useSession()
  const currentUserId = session?.user?.id
  const members = conversation?.membersInfo
  const { nonMembers } = useUsersNotInConversationList(conversation)

  // @ts-ignore
  const currentUser = members.find(({ id }) => id === currentUserId)
  const membersExCurrentUser =
    members?.filter(({ id }) => id !== currentUserId) ?? []

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search for a user" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {conversation ? (
          <>
            <CommandGroup heading="Members">
              {currentUser && (
                <CommandItem className="gap-4 justify-between">
                  <div className="flex flex-row gap-4 ml-2">
                    {currentUser.name} (me)
                  </div>

                  <Button
                    size="sm"
                    className="h-auto px-2 py-1"
                    variant="destructive"
                    onClick={() => {
                      removeUserFromConversation(
                        currentUser.id,
                        conversation.id
                      )
                    }}
                  >
                    Leave
                  </Button>
                </CommandItem>
              )}
              {membersExCurrentUser
                ?.filter(({ id }) => id !== currentUserId)
                .map((user) => (
                  <CommandItem className="gap-4 justify-between" key={user.id}>
                    <div className="flex flex-row gap-4 ml-2">{user.name}</div>
                    <Button
                      size="sm"
                      className="h-auto px-2 py-1"
                      variant="destructive"
                      onClick={() => {
                        removeUserFromConversation(user.id, conversation.id)
                      }}
                    >
                      Remove
                    </Button>
                  </CommandItem>
                ))}
            </CommandGroup>
            {nonMembers && nonMembers.length > 0 && (
              <CommandGroup heading="Invite">
                {nonMembers.map((user) => (
                  <CommandItem className="gap-4 justify-between" key={user.id}>
                    <div className="flex flex-row gap-4 ml-2">{user.name}</div>
                    <Button
                      size="sm"
                      className="h-auto px-2 py-1"
                      onClick={() => {
                        addUserToConversation(user.id, conversation.id)
                      }}
                    >
                      Add
                    </Button>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </>
        ) : (
          <CommandEmpty>No results found.</CommandEmpty>
        )}
      </CommandList>
    </CommandDialog>
  )
}
