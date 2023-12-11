import { NextResponse } from "next/server.js"

import { auth } from "./auth.js"

export default auth((req) => {
  // This is needed because NextAuth relies on nextUrl.bathPath which doesn't seem to be defined
  if (!req.auth) {
    return NextResponse.redirect(
      `${req.nextUrl.origin}/auth/sign-in?callbackUrl=${req.nextUrl.pathname}`
    )
  }
})

export const config = { matcher: ["/convo/:convoId*"] }
