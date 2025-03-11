"use client"

import { ChangeEvent, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button.js"
import { Input } from "@/components/ui/input.js"

export default function NewUserPage() {
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  return (
    <div className="p-6 rounded-md border">
      <h1 className="mb-5 font-bold text-xl">New User</h1>
      <form
        className="flex flex-col gap-5"
        onSubmit={async (e) => {
          e.preventDefault()
          setError("")
          const res = await fetch("/api/auth/new-user", {
            method: "POST",
            body: JSON.stringify({ username, password, email }),
          })
          if (!res.ok) {
            console.error("error", res)
            setError("Failed to create user")
            return
          }
          setUsername("")
          setPassword("")
          setEmail("")
          router.push("/convo")
        }}
      >
        <div>
          <label className="text-sm" htmlFor="username">
            Username
          </label>
          <Input
            type="text"
            id="username"
            placeholder="bob"
            value={username}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setUsername(e.target.value)
            }
          />
        </div>
        <div>
          <label className="text-sm" htmlFor="email">
            Email
          </label>
          <Input
            type="text"
            id="email"
            placeholder="bob@example.com"
            value={email}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setEmail(e.target.value)
            }
          />
        </div>
        <div>
          <label className="text-sm" htmlFor="password">
            Password
          </label>
          <Input
            type="password"
            id="password"
            placeholder="*****"
            value={password}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setPassword(e.target.value)
            }
          />
        </div>
        <div>
          <Button
            disabled={!(password && email && username)}
            type="submit"
            className="w-full"
          >
            Create
          </Button>
        </div>
      </form>
      {error && (
        <div className="flex items-center gap-2 p-3 mt-2 text-red-700 bg-red-100 border border-red-400 rounded-lg">
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}
      <div className="flex flex-col items-center gap-4 my-4">
        <div className="text-sm text-muted-foreground">
          Already have an account?
        </div>
        <Link
          href={"/auth/sign-in"}
          className="hover:underline text-blue-500 text-sm"
        >
          Click here to sign in.
        </Link>
      </div>
    </div>
  )
}
