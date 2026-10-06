"use client"

import { use, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Hospital,
  Inbox,
  LayoutDashboard,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Table2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { CreateDashboardDialog } from "@/components/dashboard/create-dashboard-dialog"
import { DashboardCard } from "@/components/dashboard/dashboard-card"
import type { Project } from "@/lib/types/project"
import type { Analysis } from "@/lib/types/analysis"
import type { Dashboard } from "@/lib/types/dashboard"
import { getProject } from "@/lib/api/projects"
import { getAnalyses } from "@/lib/api/analyses"
import { getDashboards } from "@/lib/api/dashboards"
import { ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"
import { formatDateTime } from "@/lib/format"

interface ActivityItem {
  id: string
  kind: "analysis" | "chart" | "dashboard"
  name: string
  updatedAt: string
  href: string
}

function kindLabel(kind: ActivityItem["kind"]): string {
  return kind === "dashboard"
    ? "Painel"
    : kind === "chart"
      ? "Gráfico"
      : "Análise"
}

const outlineButton =
  "border-border bg-card text-foreground hover:bg-muted/50 hover:text-foreground"

/**
 * Visão geral do projeto: pontuação, atividade recente e atalhos.
 * As listas completas vivem nas rotas aninhadas (fontes, explorar,
 * análises e painéis) — aqui só o resumo.
 */
export default function ProjetoDetalhePage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = use(params)
  const router = useRouter()

  const [project, setProject] = useState<Project | null>(null)
  const [analyses, setAnalyses] = useState<Analysis[] | null>(null)
  const [dashboards, setDashboards] = useState<Dashboard[] | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [createPanelOpen, setCreatePanelOpen] = useState(false)

  useEffect(() => {
    let cancelled = false

    Promise.all([getProject(projectId), getAnalyses(projectId), getDashboards(projectId)])
      .then(([projectValue, analysisList, dashboardList]) => {
        if (cancelled) return
        if (projectValue === null) {
          setNotFound(true)
          return
        }
        setProject(projectValue)
        setAnalyses(analysisList)
        setDashboards(dashboardList)
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(
          err instanceof ApiError
            ? err.detail
            : "Erro ao carregar o projeto."
        )
      })

    return () => {
      cancelled = true
    }
  }, [projectId, reloadKey])

  function handleRetry() {
    setProject(null)
    setAnalyses(null)
    setDashboards(null)
    setLoadError(null)
    setNotFound(false)
    setReloadKey((key) => key + 1)
  }

  const analysisItems = useMemo(
    () => (analyses ?? []).filter((a) => a.chartType === "table"),
    [analyses]
  )
  const chartItems = useMemo(
    () => (analyses ?? []).filter((a) => a.chartType !== "table"),
    [analyses]
  )
  const dashboardItems = dashboards ?? []
  const sourceCount = project?.sourceCount ?? 0

  const recentItems = useMemo<ActivityItem[]>(() => {
    const fromAnalyses: ActivityItem[] = (analyses ?? []).map((a) => ({
      id: a.id,
      kind: a.chartType === "table" ? ("analysis" as const) : ("chart" as const),
      name: a.name,
      updatedAt: a.updatedAt,
      href: `/projetos/${projectId}/analises/${a.id}`,
    }))
    const fromDashboards: ActivityItem[] = (dashboards ?? []).map((d) => ({
      id: d.id,
      kind: "dashboard" as const,
      name: d.name,
      updatedAt: d.updatedAt,
      href: `/projetos/${projectId}/paineis/${d.id}`,
    }))
    return [...fromAnalyses, ...fromDashboards]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 6)
  }, [projectId, analyses, dashboards])

  const exploreHref = `/projetos/${projectId}/explorar`
  const isEmptyWorkspace =
    analysisItems.length === 0 &&
    chartItems.length === 0 &&
    dashboardItems.length === 0

  function renderActivityRow(item: ActivityItem) {
    const Icon =
      item.kind === "dashboard"
        ? LayoutDashboard
        : item.kind === "chart"
          ? BarChart3
          : Table2

    const iconCls =
      item.kind === "dashboard"
        ? "bg-primary/10 text-primary"
        : item.kind === "chart"
          ? "bg-chart-4/10 text-chart-4"
          : "bg-muted text-foreground"

    return (
      <Link
        key={`${item.kind}-${item.id}`}
        href={item.href}
        className="group flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/50"
      >
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
            iconCls
          )}
        >
          <Icon size={15} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">
            {item.name}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {kindLabel(item.kind)} · Atualizado em {formatDateTime(item.updatedAt)}
          </span>
        </span>
        <ArrowLeft
          size={14}
          className="shrink-0 rotate-180 text-muted-foreground transition-colors group-hover:text-primary"
        />
      </Link>
    )
  }

  function renderEmpty(
    title: string,
    description: string,
    action: React.ReactNode
  ) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card p-10 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
          <Inbox size={20} className="text-muted-foreground" />
        </div>
        <h3 className="mt-3 text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
        <div className="mt-5">{action}</div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Loading */}
      {project === null && !loadError && !notFound && (
        <section>
          <div className="flex items-center justify-center rounded-lg border border-border bg-card p-12">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        </section>
      )}

      {/* Load error */}
      {project === null && loadError && (
        <section>
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
        </section>
      )}

      {/* Not found */}
      {notFound && project === null && (
        <section>
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
        </section>
      )}

      {/* Visão geral */}
      {project !== null && (
        <>
          {/* Header */}
          <section>
            <Link
              href="/projetos"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              <ArrowLeft size={14} />
              Projetos
            </Link>

            <div className="mt-3 flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Hospital size={22} />
              </span>
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  {project.name}
                </h1>
                {project.description && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {project.description}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Ações */}
          <section className="mt-6 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => router.push(exploreHref)}>
              <Search size={13} />
              Explorar dados
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={outlineButton}
              onClick={() => router.push(`/projetos/${projectId}/fontes/nova`)}
            >
              <Plus size={13} />
              Adicionar fonte
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCreatePanelOpen(true)}
            >
              <Plus size={13} />
              Novo painel
            </Button>
          </section>

          {/* Pontuação */}
          <section className="mt-6">
            <div className="grid grid-cols-2 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-4 sm:divide-x sm:divide-y-0">
              <div className="p-5">
                <p className="text-2xl font-semibold tabular-nums text-foreground">
                  {analysisItems.length}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Análise{analysisItems.length !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="p-5">
                <p className="text-2xl font-semibold tabular-nums text-foreground">
                  {chartItems.length}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Gráfico{chartItems.length !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="p-5">
                <p className="text-2xl font-semibold tabular-nums text-foreground">
                  {dashboardItems.length}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Painel{dashboardItems.length !== 1 ? "éis" : ""}
                </p>
              </div>
              <div className="p-5">
                <p className="text-2xl font-semibold tabular-nums text-foreground">
                  {sourceCount}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Fonte{sourceCount !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
          </section>

          {/* Atividade recente */}
          <section className="mt-6 rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-foreground">
                Atividade recente
              </h2>
              <Link
                href={`/projetos/${projectId}/analises`}
                className="text-xs font-medium text-primary hover:underline"
              >
                Ver análises
              </Link>
            </div>

            {isEmptyWorkspace ? (
              <div className="mt-3">
                {renderEmpty(
                  "Projeto vazio",
                  "Comece conectando uma fonte ou explorando dados — análises, gráficos e painéis ficam vinculados a este projeto automaticamente.",
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => router.push(exploreHref)}
                    >
                      <Search size={13} />
                      Explorar dados
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className={outlineButton}
                      onClick={() =>
                        router.push(`/projetos/${projectId}/fontes/nova`)
                      }
                    >
                      <Plus size={13} />
                      Adicionar fonte
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-2 divide-y divide-border">
                {recentItems.map(renderActivityRow)}
              </div>
            )}
          </section>

          {/* Painéis do projeto */}
          <section className="mt-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-foreground">Painéis</h2>
              <Link
                href={`/projetos/${projectId}/paineis`}
                className="text-sm font-medium text-primary hover:underline"
              >
                Ver todos
              </Link>
            </div>

            {dashboardItems.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Nenhum painel neste projeto ainda.
              </p>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {dashboardItems.slice(0, 3).map((dashboard) => (
                  <DashboardCard key={dashboard.id} dashboard={dashboard} />
                ))}
              </div>
            )}
          </section>

          {/* Criação contextual de painel */}
          <CreateDashboardDialog
            open={createPanelOpen}
            onOpenChange={setCreatePanelOpen}
            projectId={projectId}
            onCreated={(dashboard) =>
              router.push(`/projetos/${projectId}/paineis/${dashboard.id}`)
            }
          />
        </>
      )}
    </div>
  )
}
