"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { getProject } from "@/lib/api/projects"

/**
 * Navegação do interior do projeto: breadcrumb + abas. O nome do projeto
 * vem da API (fallback "Projeto" se falhar — nunca bloqueia as abas).
 */
export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname() ?? ""
  const [projectName, setProjectName] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getProject(projectId)
      .then((project) => {
        if (!cancelled) setProjectName(project?.name ?? null)
      })
      .catch(() => {
        if (!cancelled) setProjectName(null)
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  const tabs = [
    { href: `/projetos/${projectId}`, label: "Visão geral", exact: true },
    { href: `/projetos/${projectId}/paineis`, label: "Painéis" },
    { href: `/projetos/${projectId}/analises`, label: "Análises e gráficos" },
    { href: `/projetos/${projectId}/fontes`, label: "Fontes de dados" },
    { href: `/projetos/${projectId}/explorar`, label: "Explorar" },
  ]

  return (
    <div className="mb-6">
      <nav aria-label="Navegação do projeto" className="flex items-center gap-1 text-xs text-muted-foreground">
        <Link href="/projetos" className="rounded hover:text-primary hover:underline">
          Projetos
        </Link>
        <ChevronRight size={12} className="shrink-0" />
        <span className="truncate font-medium text-foreground">
          {projectName ?? "Projeto"}
        </span>
      </nav>
      <div className="mt-3 flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((tab) => {
          const active = tab.exact
            ? pathname === tab.href
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              )}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
