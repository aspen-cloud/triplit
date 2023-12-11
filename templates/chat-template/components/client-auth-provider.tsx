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
  const jwtRef = useRef<string | undefined>()
  useEffect(() => {
    if (session?.token !== jwtRef.current) {
      jwtRef.current = session?.token ?? undefined
      client.updateToken(jwtRef.current)
    }
  }, [session])

  return children
}
