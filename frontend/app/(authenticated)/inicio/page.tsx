"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  Compass,
  Database,
  FileChartColumn,
  Folder,
  History,
  LayoutDashboard,
  Loader2,
  Plus,
  Search,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import type { Dashboard } from "@/lib/types/dashboard"
import type { Analysis } from "@/lib/types/analysis"
import type { Project } from "@/lib/types/project"
import { chartTypeIcon } from "@/lib/types/charts"
import { getProjects } from "@/lib/api/projects"
import { getDashboards } from "@/lib/api/dashboards"
import { getAnalyses } from "@/lib/api/analyses"
import {
  listDatasets,
  datasetDisplayName,
} from "@/lib/api/datasets"
import { readRecentIds } from "@/lib/recent"
import { ApiError } from "@/lib/api"
import { CreateProjectDialog } from "@/components/project/create-project-dialog"
import { ProjectPickerDialog } from "@/components/project/project-picker-dialog"
import { CreateDashboardDialog } from "@/components/dashboard/create-dashboard-dialog"

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
}

function matchesQuery(haystack: string, query: string): boolean {
  if (!query) return true
  return normalize(haystack).includes(normalize(query))
}

function formatRelative(iso: string): string {
  try {
    const diffMs = Date.now() - new Date(iso).getTime()
    const minutes = Math.floor(diffMs / 60_000)
    if (minutes < 1) return "agora mesmo"
    if (minutes < 60) return `há ${minutes} min`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `há ${hours}h`
    const days = Math.floor(hours / 24)
    if (days < 7) return `há ${days}d`
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function dashboardHref(dashboard: Dashboard): string {
  if (dashboard.projectId) {
    return `/projetos/${dashboard.projectId}/paineis/${dashboard.id}`
  }
  return `/paineis/${dashboard.id}`
}

function analysisHref(analysis: Analysis): string {
  if (analysis.projectId) {
    return `/projetos/${analysis.projectId}/analises/${analysis.id}`
  }
  return "/projetos"
}

interface SectionLoad<T> {
  key: string
  items: T[] | null
  error: string | null
}

function useSection<T>(key: string, load: () => Promise<T[]>): SectionLoad<T> {
  const [state, setState] = useState<SectionLoad<T>>({
    key: "",
    items: null,
    error: null,
  })

  useEffect(() => {
    if (state.key === key) return
    let cancelled = false
    load()
      .then((items) => {
        if (!cancelled) setState({ key, items, error: null })
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            key,
            items: null,
            error: err instanceof ApiError ? err.detail : "Erro ao carregar.",
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [key, load, state.key])

  return state.key === key ? state : { key, items: null, error: null }
}

const loadProjects = () => getProjects()
const loadDashboards = () => getDashboards()
const loadAnalyses = () => getAnalyses()
const loadDatasets = () => listDatasets().then((res) => res.result ?? [])

type PickerMode =
  | { kind: "analysis" }
  | { kind: "source" }
  | { kind: "dataset"; datasetId: number; datasetName: string }
  | null

/**
 * Home analítica: saudação, busca global, projetos, continuação e criação.
 * Tudo vem das APIs existentes; sem dados fictícios.
 */
export default function InicioPage() {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const [createPanelOpen, setCreatePanelOpen] = useState(false)
  const [picker, setPicker] = useState<PickerMode>(null)

  const projects = useSection("projects", loadProjects)
  const dashboards = useSection("dashboards", loadDashboards)
  const analyses = useSection("analyses", loadAnalyses)
  const datasets = useSection("datasets", loadDatasets)

  const projectList = useMemo(() => projects.items ?? [], [projects.items])
  const recentProjectIds = useMemo(() => readRecentIds("project"), [])

  const orderedProjects = useMemo(() => {
    const recent = new Set(recentProjectIds)
    return [...projectList].sort((a, b) => {
      const aRecent = recent.has(a.id) ? 0 : 1
      const bRecent = recent.has(b.id) ? 0 : 1
      if (aRecent !== bRecent) return aRecent - bRecent
      return b.updatedAt.localeCompare(a.updatedAt)
    })
  }, [projectList, recentProjectIds])

  const searching = query.trim().length > 0

  const searchResults = useMemo(() => {
    if (!searching) return null
    const q = query.trim()
    const matchedProjects = projectList.filter((p) =>
      matchesQuery(`${p.name} ${p.description}`, q)
    )
    const matchedDashboards = (dashboards.items ?? []).filter((d) =>
      matchesQuery(d.name, q)
    )
    const matchedAnalyses = (analyses.items ?? []).filter((a) =>
      matchesQuery(`${a.name} ${a.description ?? ""}`, q)
    )
    const matchedDatasets = (datasets.items ?? []).filter((d) =>
      matchesQuery(`${d.table_name} ${d.description ?? ""}`, q)
    )
    return { matchedProjects, matchedDashboards, matchedAnalyses, matchedDatasets }
  }, [searching, query, projectList, dashboards.items, analyses.items, datasets.items])

  const continueItems = useMemo(() => {
    const mixed: (
      | { kind: "dashboard"; item: Dashboard; updatedAt: string }
      | { kind: "analysis"; item: Analysis; updatedAt: string }
    )[] = [
      ...(dashboards.items ?? []).map((item) => ({
        kind: "dashboard" as const,
        item,
        updatedAt: item.updatedAt,
      })),
      ...(analyses.items ?? []).map((item) => ({
        kind: "analysis" as const,
        item,
        updatedAt: item.updatedAt,
      })),
    ]
    return mixed
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 6)
  }, [dashboards.items, analyses.items])

  const loadingSections =
    projects.items === null ||
    dashboards.items === null ||
    analyses.items === null

  function handlePickProject(project: Project) {
    if (!picker) return
    if (picker.kind === "analysis") {
      router.push(`/projetos/${project.id}/explorar`)
    } else if (picker.kind === "source") {
      router.push(`/projetos/${project.id}/fontes/nova`)
    } else {
      router.push(
        `/projetos/${project.id}/explorar?datasetId=${picker.datasetId}`
      )
    }
    setPicker(null)
  }

  const pickerCopy =
    picker?.kind === "analysis"
      ? {
          title: "Nova análise",
          description: "Escolha o projeto onde a análise será salva.",
        }
      : picker?.kind === "source"
        ? {
            title: "Conectar fonte de dados",
            description: "Escolha o projeto que receberá a nova fonte.",
          }
        : {
            title: `Explorar ${picker?.datasetName ?? "dados"}`,
            description: "Escolha o projeto onde os dados serão explorados.",
          }

  const startActions = [
    {
      icon: Folder,
      title: "Novo projeto",
      description: "Agrupe painéis, análises e dados por tema.",
      onClick: () => setCreateProjectOpen(true),
    },
    {
      icon: LayoutDashboard,
      title: "Novo painel",
      description: "Monte um dashboard arrastando elementos.",
      onClick: () => setCreatePanelOpen(true),
    },
    {
      icon: Compass,
      title: "Nova análise",
      description: "Explore dados e salve o resultado.",
      onClick: () => setPicker({ kind: "analysis" }),
    },
    {
      icon: Database,
      title: "Conectar fonte",
      description: "Ligue um banco ou arquivo ao projeto.",
      onClick: () => setPicker({ kind: "source" }),
    },
  ]

  return (
    <div className="w-full px-4 sm:px-5 lg:px-10 py-25">
      {/* Saudação + busca */}
      <section className="flex flex-col items-center justify-center text-center">
        <p className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
          <Sparkles size={13} />
          Workspace analítico
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          O que vamos investigar hoje?
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Busque projetos, painéis, análises e dados em um só lugar.
        </p>
        <div className="relative mx-auto mt-5 w-full max-w-3xl">
          <Search
            size={17}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome, tema ou assunto..."
            aria-label="Buscar projetos, painéis, análises e dados"
            className="h-12 rounded-xl border-border bg-card pl-11 pr-4 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:ring-ring/60"
          />
        </div>
      </section>

      {/* Resultados da busca */}
      {searchResults && (
        <>
          <Separator className="mt-8" />
          <section aria-label="Resultados da busca" className="mt-6 w-full">
          {searchResults.matchedProjects.length +
            searchResults.matchedDashboards.length +
            searchResults.matchedAnalyses.length +
            searchResults.matchedDatasets.length ===
          0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card px-6 py-8 text-center">
              <p className="text-sm font-medium text-foreground">
                Nada encontrado para “{query.trim()}”
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Tente outro termo ou comece algo novo abaixo.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {searchResults.matchedProjects.length > 0 && (
                <div>
                  <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Projetos
                  </h2>
                  <ul className="space-y-1.5">
                    {searchResults.matchedProjects.slice(0, 4).map((project) => (
                      <li key={project.id}>
                        <Link
                          href={`/projetos/${project.id}`}
                          className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5 transition-colors hover:border-primary/40"
                        >
                          <Folder size={15} className="shrink-0 text-primary" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-foreground">
                              {project.name}
                            </span>
                            {project.description && (
                              <span className="block truncate text-xs text-muted-foreground">
                                {project.description}
                              </span>
                            )}
                          </span>
                          <Badge className="shrink-0 bg-primary/10 text-primary">
                            {project.dashboardCount}{" "}
                            {project.dashboardCount === 1 ? "painel" : "painéis"}
                          </Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {searchResults.matchedDashboards.length > 0 && (
                <div>
                  <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Painéis
                  </h2>
                  <ul className="space-y-1.5">
                    {searchResults.matchedDashboards.slice(0, 4).map((dashboard) => (
                      <li key={dashboard.id}>
                        <Link
                          href={dashboardHref(dashboard)}
                          className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5 transition-colors hover:border-primary/40"
                        >
                          <LayoutDashboard size={15} className="shrink-0 text-primary" />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                            {dashboard.name}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {searchResults.matchedAnalyses.length > 0 && (
                <div>
                  <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Análises
                  </h2>
                  <ul className="space-y-1.5">
                    {searchResults.matchedAnalyses.slice(0, 4).map((analysis) => {
                      const Icon = chartTypeIcon[analysis.chartType] ?? BarChart3
                      return (
                        <li key={analysis.id}>
                          <Link
                            href={analysisHref(analysis)}
                            className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5 transition-colors hover:border-primary/40"
                          >
                            <Icon size={15} className="shrink-0 text-primary" />
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                              {analysis.name}
                            </span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
              {searchResults.matchedDatasets.length > 0 && (
                <div>
                  <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Dados
                  </h2>
                  <ul className="space-y-1.5">
                    {searchResults.matchedDatasets.slice(0, 4).map((dataset) => (
                      <li key={dataset.id}>
                        <button
                          type="button"
                          onClick={() =>
                            setPicker({
                              kind: "dataset",
                              datasetId: dataset.id,
                              datasetName: datasetDisplayName(dataset),
                            })
                          }
                          className="flex w-full items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5 text-left transition-colors hover:border-primary/40"
                        >
                          <Database size={15} className="shrink-0 text-primary" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-foreground">
                              {datasetDisplayName(dataset)}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {dataset.database?.database_name ?? "Banco de dados"}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
        </>
      )}

      {/* Projetos */}
      {!searching && (
        <>
          <Separator className="mt-8" />
          <section aria-label="Projetos" className="mt-6 w-full">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Seus projetos</h2>
            <Link
              href="/projetos"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Ver todos
              <ArrowRight size={13} />
            </Link>
          </div>
          {projects.items === null && !projects.error && (
            <div className="flex items-center justify-center rounded-xl border border-border bg-card p-10">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          )}
          {projects.error && (
            <div className="flex items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-warning">
              <AlertCircle size={14} className="shrink-0" />
              {projects.error}
            </div>
          )}
          {projects.items !== null && projectList.length === 0 && (
            <div className="rounded-xl border border-dashed border-border bg-card px-6 py-8 text-center">
              <p className="text-sm font-medium text-foreground">
                Nenhum projeto ainda
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Crie o primeiro para agrupar painéis, análises e dados.
              </p>
              <Button size="sm" className="mt-4" onClick={() => setCreateProjectOpen(true)}>
                <Plus size={14} />
                Novo projeto
              </Button>
            </div>
          )}
          {orderedProjects.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {orderedProjects.slice(0, 6).map((project) => (
                <Link
                  key={project.id}
                  href={`/projetos/${project.id}`}
                  className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Folder size={18} />
                  </span>
                  <span className="mt-3 block truncate text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                    {project.name}
                  </span>
                  {project.description && (
                    <span className="mt-1 block text-xs text-muted-foreground line-clamp-2">
                      {project.description}
                    </span>
                  )}
                  <span className="mt-3 flex flex-wrap gap-1.5">
                    <Badge className="bg-primary/10 text-primary">
                      {project.dashboardCount}{" "}
                      {project.dashboardCount === 1 ? "painel" : "painéis"}
                    </Badge>
                    <Badge className="bg-chart-4/10 text-chart-4">
                      {project.analysisCount}{" "}
                      {project.analysisCount === 1 ? "análise" : "análises"}
                    </Badge>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
        </>
      )}

      {/* Comece algo novo */}
      {!searching && (
        <>
          <Separator className="mt-8" />
          <section aria-label="Comece algo novo" className="mt-6 w-full pb-4">
          <h2 className="mb-3 flex items-center gap-1.5 text-base font-semibold text-foreground">
            <FileChartColumn size={16} className="text-primary" />
            Comece algo novo
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {startActions.map((action) => (
              <button
                key={action.title}
                type="button"
                onClick={action.onClick}
                className={cn(
                  "group rounded-xl border border-border bg-card p-5 text-left",
                  "transition-colors hover:border-primary/40 hover:bg-primary/5"
                )}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <action.icon size={18} />
                </span>
                <span className="mt-3 block text-sm font-semibold text-foreground">
                  {action.title}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                  {action.description}
                </span>
              </button>
            ))}
          </div>
        </section>
        </>
      )}

      <CreateProjectDialog
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
        onCreated={(project) => router.push(`/projetos/${project.id}`)}
      />
      <CreateDashboardDialog
        open={createPanelOpen}
        onOpenChange={setCreatePanelOpen}
        onCreated={(dashboard) =>
          router.push(
            dashboard.projectId
              ? `/projetos/${dashboard.projectId}/paineis/${dashboard.id}`
              : `/paineis/${dashboard.id}`
          )
        }
      />
      <ProjectPickerDialog
        open={picker !== null}
        onOpenChange={(open) => {
          if (!open) setPicker(null)
        }}
        title={pickerCopy.title}
        description={pickerCopy.description}
        projects={projectList}
        onPick={handlePickProject}
      />
    </div>
  )
}
