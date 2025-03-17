"use client"

import React, { useEffect, useRef } from "react"
import { Session } from "next-auth"
import { useSession } from "next-auth/react"

import { client } from "@/lib/triplit.js"

export function ClientAuthProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const { data: session, status } = useSession()
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

  // If the session is loading, show a loading message to the user.
  if (status === "loading") {
    return (
      <div className="flex h-full items-center justify-center">
        <p>Loading...</p>
      </div>
    )
  }

  // If not signed in, should redirect to sign in page. Show a message to the user.
  if (status === "unauthenticated") {
    return (
      <div className="flex h-full items-center justify-center">
        <p>Signing out...</p>
      </div>
    )
  }

  // In the authenticated parts of the app, provide the current user
  return (
    <CurrentUserProvider user={session!.user!}>{children}</CurrentUserProvider>
  )
}

const currentUserContext = React.createContext<Session["user"]>(undefined)

function CurrentUserProvider({
  children,
  user,
}: {
  children: React.ReactNode
  user: NonNullable<Session["user"]>
}) {
  return (
    <currentUserContext.Provider value={user}>
      {children}
    </currentUserContext.Provider>
  )
}

export function useCurrentUser() {
  const user = React.useContext(currentUserContext)
  if (!user) {
    throw new Error("useCurrentUser must be used within a CurrentUserProvider")
  }
  return user
}
