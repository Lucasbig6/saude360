"use client"

import { ReactNode, useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { Header } from "./header"
import { ProjectNav } from "./project-nav"

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const mainRef = useRef<HTMLElement>(null)
  const pathname = usePathname()

  // `main` é o scroller único do shell e persiste entre rotas; o reset de
  // scroll do Next vale para `window`, então reiniciamos manualmente.
  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0
  }, [pathname])

  return (
    <div className="flex h-dvh min-w-0 flex-col overflow-hidden bg-background">
      <Header />
      <ProjectNav />
      <main ref={mainRef} className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
