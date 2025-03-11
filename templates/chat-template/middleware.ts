import { withAuth } from "next-auth/middleware"

import { jwtDecode } from "./lib/next-auth.js"

export default withAuth({
  // https://next-auth.js.org/configuration/nextjs#custom-jwt-decode-method
  jwt: { decode: jwtDecode },
  callbacks: {
    authorized: ({ token }) => !!token,
  },
})

export const config = { matcher: ["/convo/:convoId*"] }
