export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <section className="container flex flex-col h-screen items-center justify-center ">
      {children}
    </section>
  )
}
