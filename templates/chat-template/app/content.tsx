"use client"

import { Suspense } from "react"
import { SessionProvider } from "next-auth/react"

import { ClientAuthProvider } from "@/components/client-auth-provider.js"
import { ThemeProvider } from "@/components/theme-provider.js"

export function Content({ children }: any) {
  return (
    <SessionProvider>
      <ClientAuthProvider>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <div className="relative flex min-h-screen flex-col">
            <Suspense fallback={<div>Loading...</div>}>{children}</Suspense>{" "}
          </div>
        </ThemeProvider>
      </ClientAuthProvider>
    </SessionProvider>
  )
}
