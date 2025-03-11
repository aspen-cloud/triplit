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
    const token = session?.token
    if (token !== client.token) {
      const endSessionPromise = client.endSession()
      if (!token) {
        client.reset()
        return
      }
      endSessionPromise.then(() => client.startSession(token))
    }
  }, [session])

  return children
}
