"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Compass,
  Database,
  FileChartColumn,
  Folder,
  Hospital,
  LayoutDashboard,
  Loader2,
  Plus,
  RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ProjectTabs } from "@/components/project/project-tabs"
import { CreateDashboardDialog } from "@/components/dashboard/create-dashboard-dialog"
import type { Project } from "@/lib/types/project"
import type { Dashboard } from "@/lib/types/dashboard"
import type { Analysis } from "@/lib/types/analysis"
import { chartTypeIcon } from "@/lib/types/charts"
import { getProject } from "@/lib/api/projects"
import { getDashboards } from "@/lib/api/dashboards"
import { getAnalyses } from "@/lib/api/analyses"
import { ApiError } from "@/lib/api"

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

function byUpdatedDesc<T extends { updatedAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

interface SectionLoad<T> {
  items: T[] | null
  error: string | null
}

/**
 * Visão geral do projeto: resumo, itens recentes e criação vinculada.
 * Painéis e análises carregam de forma independente — o erro de um não
 * esconde o outro.
 */
export default function ProjetoDetalhePage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = use(params)
  const router = useRouter()
  const [reloadKey, setReloadKey] = useState(0)
  const loadKey = `${projectId}#${reloadKey}`
  const [projectLoad, setProjectLoad] = useState<{
    key: string
    project: Project | null
    notFound: boolean
    error: string | null
  } | null>(null)
  const [dashboards, setDashboards] = useState<SectionLoad<Dashboard> & { key: string }>({
    key: "",
    items: null,
    error: null,
  })
  const [analyses, setAnalyses] = useState<SectionLoad<Analysis> & { key: string }>({
    key: "",
    items: null,
    error: null,
  })
  const [createPanelOpen, setCreatePanelOpen] = useState(false)

  useEffect(() => {
    if (projectLoad?.key === loadKey) return
    let cancelled = false
    getProject(projectId)
      .then((value) => {
        if (cancelled) return
        if (value === null) {
          setProjectLoad({ key: loadKey, project: null, notFound: true, error: null })
          return
        }
        setProjectLoad({ key: loadKey, project: value, notFound: false, error: null })
      })
      .catch((err) => {
        if (cancelled) return
        setProjectLoad({
          key: loadKey,
          project: null,
          notFound: false,
          error: err instanceof ApiError ? err.detail : "Erro ao carregar o projeto.",
        })
      })
    return () => {
      cancelled = true
    }
  }, [projectId, loadKey, projectLoad?.key])

  useEffect(() => {
    if (dashboards.key === loadKey && analyses.key === loadKey) return
    let cancelled = false
    getDashboards(projectId)
      .then((list) => {
        if (!cancelled) setDashboards({ key: loadKey, items: list, error: null })
      })
      .catch((err) => {
        if (!cancelled) {
          setDashboards({
            key: loadKey,
            items: null,
            error:
              err instanceof ApiError
                ? err.detail
                : "Erro ao carregar os painéis.",
          })
        }
      })
    getAnalyses(projectId)
      .then((list) => {
        if (!cancelled) setAnalyses({ key: loadKey, items: list, error: null })
      })
      .catch((err) => {
        if (!cancelled) {
          setAnalyses({
            key: loadKey,
            items: null,
            error:
              err instanceof ApiError
                ? err.detail
                : "Erro ao carregar as análises.",
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [projectId, loadKey, dashboards.key, analyses.key])

  function handleRetry() {
    setReloadKey((key) => key + 1)
  }

  const projectReady = projectLoad?.key === loadKey
  const project = projectReady ? projectLoad.project : null
  const loadError = projectReady ? projectLoad.error : null
  const notFound = projectReady ? projectLoad.notFound : false
  const dashboardsReady = dashboards.key === loadKey
  const analysesReady = analyses.key === loadKey

  if (!project && !loadError && !notFound) {
    return (
      <div className="w-full px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex items-center justify-center rounded-lg border border-border bg-card p-12">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="w-full px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-6 py-8 text-center">
          <div className="flex items-center justify-center gap-2 text-sm font-medium text-warning">
            <AlertCircle size={16} />
            {loadError}
          </div>
          <div className="mt-4 flex justify-center">
            <Button variant="outline" size="sm" onClick={handleRetry}>
              <RefreshCw size={13} />
              Tentar novamente
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (notFound || !project) {
    return (
      <div className="w-full px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card p-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Hospital size={24} className="text-primary" />
          </div>
          <h1 className="mt-4 text-sm font-semibold text-foreground">
            Projeto não encontrado
          </h1>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Ele pode ter sido excluído ou o link está incorreto.
          </p>
          <Link href="/projetos" className="mt-6">
            <Button variant="outline">
              <ArrowLeft size={14} />
              Voltar para Projetos
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  const recentDashboards = byUpdatedDesc(dashboardsReady ? dashboards.items ?? [] : []).slice(0, 5)
  const recentAnalyses = byUpdatedDesc(analysesReady ? analyses.items ?? [] : []).slice(0, 5)

  const summary = [
    {
      href: `/projetos/${projectId}/paineis`,
      icon: LayoutDashboard,
      label: "Painéis",
      count: project.dashboardCount,
    },
    {
      href: `/projetos/${projectId}/analises`,
      icon: BarChart3,
      label: "Análises",
      count: project.analysisCount,
    },
    {
      href: `/projetos/${projectId}/analises`,
      icon: FileChartColumn,
      label: "Gráficos",
      count: project.chartCount,
    },
    {
      href: `/projetos/${projectId}/fontes`,
      icon: Database,
      label: "Fontes",
      count: project.sourceCount,
    },
  ]

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
      <ProjectTabs projectId={projectId} />

      <section className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Folder size={22} />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
              {project.name}
            </h1>
            {project.description && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {project.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/projetos/${projectId}/explorar`}>
            <Button variant="outline" size="sm">
              <Compass size={14} />
              Nova análise
            </Button>
          </Link>
          <Button size="sm" onClick={() => setCreatePanelOpen(true)}>
            <Plus size={14} />
            Novo painel
          </Button>
        </div>
      </section>

      <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summary.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40"
          >
            <span className="flex items-center gap-2 text-muted-foreground">
              <item.icon size={15} className="text-primary" />
              <span className="text-xs font-medium uppercase tracking-wide">
                {item.label}
              </span>
            </span>
            <span className="mt-1 block text-2xl font-semibold text-foreground transition-colors group-hover:text-primary">
              {item.count}
            </span>
          </Link>
        ))}
      </section>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section aria-label="Painéis recentes">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              Painéis recentes
            </h2>
            <Link
              href={`/projetos/${projectId}/paineis`}
              className="text-xs font-medium text-primary hover:underline"
            >
              Ver todos
            </Link>
          </div>
          {!dashboardsReady && (
            <div className="flex items-center justify-center rounded-lg border border-border bg-card p-8">
              <Loader2 size={18} className="animate-spin text-muted-foreground" />
            </div>
          )}
          {dashboardsReady && dashboards.error && (
            <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-warning">
              <AlertCircle size={14} className="shrink-0" />
              {dashboards.error}
            </div>
          )}
          {dashboardsReady && dashboards.items !== null && recentDashboards.length === 0 && (
            <div className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-center text-xs text-muted-foreground">
              Nenhum painel neste projeto ainda.
            </div>
          )}
          {recentDashboards.length > 0 && (
            <ul className="space-y-2">
              {recentDashboards.map((dashboard) => (
                <li key={dashboard.id}>
                  <Link
                    href={`/projetos/${projectId}/paineis/${dashboard.id}`}
                    className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5 transition-colors hover:border-primary/40"
                  >
                    <LayoutDashboard size={15} className="shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                      {dashboard.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatRelative(dashboard.updatedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Análises recentes">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              Análises recentes
            </h2>
            <Link
              href={`/projetos/${projectId}/analises`}
              className="text-xs font-medium text-primary hover:underline"
            >
              Ver todas
            </Link>
          </div>
          {!analysesReady && (
            <div className="flex items-center justify-center rounded-lg border border-border bg-card p-8">
              <Loader2 size={18} className="animate-spin text-muted-foreground" />
            </div>
          )}
          {analysesReady && analyses.error && (
            <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-warning">
              <AlertCircle size={14} className="shrink-0" />
              {analyses.error}
            </div>
          )}
          {analysesReady && analyses.items !== null && recentAnalyses.length === 0 && (
            <div className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-center text-xs text-muted-foreground">
              Nenhuma análise neste projeto ainda.
            </div>
          )}
          {recentAnalyses.length > 0 && (
            <ul className="space-y-2">
              {recentAnalyses.map((analysis) => {
                const Icon = chartTypeIcon[analysis.chartType] ?? BarChart3
                return (
                  <li key={analysis.id}>
                    <Link
                      href={`/projetos/${projectId}/analises/${analysis.id}`}
                      className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5 transition-colors hover:border-primary/40"
                    >
                      <Icon size={15} className="shrink-0 text-primary" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                        {analysis.name}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatRelative(analysis.updatedAt)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <CreateDashboardDialog
        open={createPanelOpen}
        onOpenChange={setCreatePanelOpen}
        projectId={projectId}
        onCreated={(dashboard) =>
          router.push(`/projetos/${projectId}/paineis/${dashboard.id}`)
        }
      />
    </div>
  )
}
