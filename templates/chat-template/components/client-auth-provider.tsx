"use client"

import { useEffect, useRef } from "react"
import { useSession } from "next-auth/react"

import { client } from "@/lib/triplit.js"

export function ClientAuthProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const { data: session } = useSession()
  useEffect(() => {
    // @ts-expect-error
    const token = session?.token
    if (token !== client.token) {
      client.disconnect()
      client.updateToken(token)
      if (!client.token) {
        // Note: this is async
        client.reset()
      } else {
        client.connect()
      }
    }
  }, [session])

  return children
}
