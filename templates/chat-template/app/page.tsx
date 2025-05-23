import Link from "next/link"

import { Button } from "@/components/ui/button.js"

export default async function IndexPage() {
  return (
    <section className="container mx-auto p-10 flex flex-col items-center">
      <div className="prose dark:prose-invert">
        <h1>The Triplit Chat Template</h1>
        <p>
          A full-stack template for a chat app with all of the features you need
          in production.
        </p>
        <h3>Features</h3>
        <ul>
          <li>
            Sent/unsent indicators for messages using Triplit&apos;s{" "}
            <code>syncStatus</code> query filter
          </li>
          <li>Infinite scrolling with Triplit&apos;s React hooks</li>
          <li>
            Offline support using Triplit&apos;s built-in offline cache and
            optimistic updates
          </li>
          <li>
            Realtime updates and syncing between clients using Triplit&apos;s
            sync engine
          </li>
          <li>Durable client storage with IndexedDB</li>
          <li>
            User accounts stored in Triplit&apos;s remote database and database
            auth sessions managed by Triplit
          </li>
          <li>Simple local development experience with seeding utilities</li>
        </ul>
        <h3>Built with</h3>
        <p>
          <a href="https://nextjs.org/"> Next.js</a>,{" "}
          <a href="https://next-auth.js.org/"> NextAuth.js</a>,{" "}
          <a href="https://tailwindcss.com/">Tailwind CSS</a>,{" "}
          <a href="https://ui.shadcn.com/">shadcn/ui</a>, and{" "}
          <a href="https://triplit.dev">Triplit</a>.
        </p>
        <h3>Questions/Feedback</h3>{" "}
        <p>
          Instructions to run the app and local development environment are in
          the `README.md` of this repo.
        </p>
        <p>
          Get in touch with us on{" "}
          <a href="'https://discord.gg/q89sGWHqQ5'">Discord</a>
        </p>
      </div>
      <Link href="/convo" className="my-10">
        <Button>Click here to chat</Button>
      </Link>
    </section>
  )
}
