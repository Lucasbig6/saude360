"use client"

import {
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ComponentType,
} from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Activity,
  BarChart3,
  Database,
  FileChartColumn,
  Hospital,
  Home,
  LayoutGrid,
  Search,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { getProject } from "@/lib/api/projects"

export interface NavLink {
  name: string
  href: string
  icon: ComponentType<{ size?: number; className?: string }>
  exact?: boolean
}

export interface NavSection {
  label?: string
  items: NavLink[]
}

export function isNavActive(pathname: string, link: NavLink): boolean {
  if (link.href === "/inicio") {
    return pathname === "/inicio" || pathname === "/"
  }
  if (link.exact) return pathname === link.href
  return pathname === link.href || pathname.startsWith(`${link.href}/`)
}

const globalItems: NavLink[] = [
  { name: "Início", href: "/inicio", icon: Home },
  { name: "Projetos", href: "/projetos", icon: Hospital },
  { name: "Painéis", href: "/paineis", icon: BarChart3 },
]

function projectItems(projectId: string): NavLink[] {
  return [
    {
      name: "Visão geral",
      href: `/projetos/${projectId}`,
      icon: LayoutGrid,
      exact: true,
    },
    {
      name: "Fontes",
      href: `/projetos/${projectId}/fontes`,
      icon: Database,
    },
    {
      name: "Explorar",
      href: `/projetos/${projectId}/explorar`,
      icon: Search,
    },
    {
      name: "Análises",
      href: `/projetos/${projectId}/analises`,
      icon: FileChartColumn,
    },
    {
      name: "Painéis",
      href: `/projetos/${projectId}/paineis`,
      icon: BarChart3,
    },
  ]
}

/** `/projetos/<id>/...` -> id do projeto em contexto. */
export function projectIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/projetos\/([^/]+)/)
  return match ? match[1] : null
}

/** Nome do projeto em contexto (store externa p/ reuso entre as duas sides). */
const projectNameCache = new Map<string, string>()
const projectNameListeners = new Set<() => void>()

function subscribeProjectNames(listener: () => void): () => void {
  projectNameListeners.add(listener)
  return () => {
    projectNameListeners.delete(listener)
  }
}

function readProjectName(projectId: string | null): string | null {
  if (!projectId) return null
  return projectNameCache.get(projectId) ?? null
}

function loadProjectName(projectId: string): Promise<string | null> {
  const cached = projectNameCache.get(projectId)
  if (cached) return Promise.resolve(cached)

  return getProject(projectId).then((project) => {
    if (!project) return null
    projectNameCache.set(projectId, project.name)
    projectNameListeners.forEach((listener) => listener())
    return project.name
  })
}

function useProjectName(projectId: string | null): string | null {
  const name = useSyncExternalStore(
    subscribeProjectNames,
    () => readProjectName(projectId),
    () => null
  )

  useEffect(() => {
    if (!projectId) return
    // erro é silencioso: o rótulo é informativo
    void loadProjectName(projectId).catch(() => null)
  }, [projectId])

  return name
}

/** Seções da sidebar: navegação global + bloco do projeto quando houver. */
export function useNavSections(): NavSection[] {
  const pathname = usePathname()
  const projectId = projectIdFromPath(pathname)
  const projectName = useProjectName(projectId)

  return useMemo(() => {
    const sections: NavSection[] = [{ items: globalItems }]
    if (projectId) {
      sections.push({
        label: projectName ?? "Projeto",
        items: projectItems(projectId),
      })
    }
    return sections
  }, [projectId, projectName])
}

export function BrandMark() {
  return (
    <>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Activity size={18} strokeWidth={2.5} />
      </div>
      <span className="whitespace-nowrap text-base font-semibold text-foreground">
        Saude360
      </span>
    </>
  )
}

export function SidebarBrand() {
  return (
    <Link
      href="/inicio"
      className="flex h-16 shrink-0 items-center gap-2.5 border-b border-border px-4"
    >
      <BrandMark />
    </Link>
  )
}

function NavItem({
  link,
  onNavigate,
}: {
  link: NavLink
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const active = isNavActive(pathname, link)
  const Icon = link.icon

  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <Icon size={17} className="shrink-0" />
      <span className="truncate">{link.name}</span>
    </Link>
  )
}

function NavSections({
  sections,
  onNavigate,
}: {
  sections: NavSection[]
  onNavigate?: () => void
}) {
  return (
    <div className="flex flex-col gap-6">
      {sections.map((section, index) => (
        <div key={section.label ?? `section-${index}`} className="flex flex-col gap-1">
          {section.label && (
            <span className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {section.label}
            </span>
          )}
          {section.items.map((link) => (
            <NavItem key={link.href} link={link} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SidebarContent({
  sections,
  onNavigate,
  className,
}: {
  sections: NavSection[]
  onNavigate?: () => void
  className?: string
}) {
  return (
    <nav
      aria-label="Navegação"
      className={cn("flex-1 overflow-y-auto p-3", className)}
    >
      <NavSections sections={sections} onNavigate={onNavigate} />
    </nav>
  )
}

export function Sidebar({
  sections,
  className,
}: {
  sections: NavSection[]
  className?: string
}) {
  return (
    <aside
      className={cn(
        "hidden w-60 shrink-0 flex-col border-r border-border bg-card md:flex",
        className
      )}
    >
      <SidebarBrand />
      <SidebarContent sections={sections} />
    </aside>
  )
}
