"use client"

import { ChangeEvent, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { signIn } from "next-auth/react"

import { Button } from "@/components/ui/button.js"
import { Input } from "@/components/ui/input.js"

function onClickGitHubSignIn() {
  signIn("github", { callbackUrl: "/convo", redirect: true })
}

export default function NewUserPage() {
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  return (
    <div className="p-6 rounded-md border">
      <h1 className="mb-5 font-bold text-xl">Sign in</h1>
      <form
        className="flex flex-col gap-5"
        onSubmit={async (e) => {
          e.preventDefault()
          signIn("credentials", {
            username,
            password,
            redirect: true,
            callbackUrl: "/convo",
          })
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
            disabled={!(password && username)}
            type="submit"
            className="w-full"
          >
            Submit
          </Button>
        </div>
      </form>
      <div className="flex flex-col items-center gap-2 my-4">
        <div className="text-sm text-muted-foreground">or</div>

        <Button
          onClick={onClickGitHubSignIn}
          variant="secondary"
          className="w-full"
        >
          Sign in with Github
        </Button>
        <div className="text-sm text-muted-foreground">or</div>
        <Link href={"/auth/sign-up"} className="w-full">
          <Button variant="secondary" className="w-full">
            Create an account
          </Button>
        </Link>
      </div>
    </div>
  )
}
