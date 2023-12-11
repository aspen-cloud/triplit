import { useParams } from "next/navigation"

export function useSelectedConvo() {
  const params = useParams()
  return params.conversationId
}
