"use client"

import { ReactNode } from "react"
import { Header } from "./header"

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <Header />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
