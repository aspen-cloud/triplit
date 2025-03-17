import "@/styles/globals.css"
import { Suspense } from "react"
import { Metadata, Viewport } from "next"

import { siteConfig } from "@/config/site.js"
import { fontSans } from "@/lib/fonts.js"
import { cn } from "@/lib/utils.js"
import { ThemeProvider } from "@/components/theme-provider.js"

export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s - ${siteConfig.name}`,
  },
  description: siteConfig.description,

  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon-16x16.png",
    apple: "/apple-touch-icon.png",
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
}

interface RootLayoutProps {
  children: React.ReactNode
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <>
      <html lang="en" suppressHydrationWarning>
        <head />
        <body
          className={cn(
            "min-h-screen bg-background font-sans antialiased",
            fontSans.variable
          )}
        >
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <div className="relative flex min-h-screen flex-col">
              <Suspense fallback={<div>Loading...</div>}>{children}</Suspense>{" "}
            </div>
          </ThemeProvider>
        </body>
      </html>
    </>
  )
}
