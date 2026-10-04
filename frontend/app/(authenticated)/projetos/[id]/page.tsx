"use client"

import { use, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  ChevronRight,
  Hospital,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  Loader2,
  Plus,
  RefreshCw,
  Table2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { SegmentedTabs } from "@/components/ui/segmented-tabs"
import { CreateDashboardDialog } from "@/components/dashboard/create-dashboard-dialog"
import type { Project } from "@/lib/types/project"
import type { Analysis } from "@/lib/types/analysis"
import type { Dashboard } from "@/lib/types/dashboard"
import { chartTypeIcon, chartTypeLabel } from "@/lib/types/charts"
import { getProject } from "@/lib/api/projects"
import { getAnalyses } from "@/lib/api/analyses"
import { getDashboards } from "@/lib/api/dashboards"
import { ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"

type WorkspaceTab = "overview" | "analyses" | "charts" | "dashboards"

interface ActivityItem {
  id: string
  kind: "analysis" | "chart" | "dashboard"
  name: string
  updatedAt: string
  href: string
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function kindLabel(kind: ActivityItem["kind"]): string {
  return kind === "dashboard"
    ? "Painel"
    : kind === "chart"
      ? "Gráfico"
      : "Análise"
}

export default function ProjetoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()

  const [project, setProject] = useState<Project | null>(null)
  const [analyses, setAnalyses] = useState<Analysis[] | null>(null)
  const [dashboards, setDashboards] = useState<Dashboard[] | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [tab, setTab] = useState<WorkspaceTab>("overview")
  const [createPanelOpen, setCreatePanelOpen] = useState(false)

  useEffect(() => {
    let cancelled = false

    Promise.all([getProject(id), getAnalyses(id), getDashboards(id)])
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
  }, [id, reloadKey])

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

  const recentItems = useMemo<ActivityItem[]>(() => {
    const fromAnalyses: ActivityItem[] = (analyses ?? []).map((a) => ({
      id: a.id,
      kind: a.chartType === "table" ? ("analysis" as const) : ("chart" as const),
      name: a.name,
      updatedAt: a.updatedAt,
      href: `/analises/${a.id}`,
    }))
    const fromDashboards: ActivityItem[] = (dashboards ?? []).map((d) => ({
      id: d.id,
      kind: "dashboard" as const,
      name: d.name,
      updatedAt: d.updatedAt,
      href: `/paineis/${d.id}`,
    }))
    return [...fromAnalyses, ...fromDashboards]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 6)
  }, [analyses, dashboards])

  const exploreHref = `/explorar?projectId=${id}`
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
        ? "bg-teal-50 text-teal-700"
        : item.kind === "chart"
          ? "bg-purple-50 text-purple-700"
          : "bg-slate-100 text-slate-700"

    return (
      <Link
        key={`${item.kind}-${item.id}`}
        href={item.href}
        className="group flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-slate-50"
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
          <span className="block truncate text-sm font-medium text-slate-900">
            {item.name}
          </span>
          <span className="mt-0.5 block truncate text-xs text-slate-500">
            {kindLabel(item.kind)} · Atualizado em {formatDate(item.updatedAt)}
          </span>
        </span>
        <ChevronRight
          size={14}
          className="shrink-0 text-slate-300 transition-colors group-hover:text-teal-600"
        />
      </Link>
    )
  }

  function renderAnalysisCards(items: Analysis[]) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((analysis) => {
          const Icon = chartTypeIcon[analysis.chartType]
          const isChart = analysis.chartType !== "table"

          return (
            <div
              key={analysis.id}
              className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg",
                    isChart
                      ? "bg-purple-50 text-purple-700"
                      : "bg-teal-50 text-teal-700"
                  )}
                >
                  <Icon size={18} />
                </span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
                    isChart
                      ? "bg-purple-50 text-purple-700"
                      : "bg-teal-50 text-teal-700"
                  )}
                >
                  {chartTypeLabel[analysis.chartType]}
                </span>
              </div>

              <h3 className="mt-3 text-sm font-semibold text-slate-900 line-clamp-1">
                {analysis.name}
              </h3>

              {analysis.description && (
                <p className="mt-1 text-xs text-slate-500 line-clamp-2">
                  {analysis.description}
                </p>
              )}

              <p className="mt-3 text-xs text-slate-400">
                Atualizado em {formatDate(analysis.updatedAt)}
              </p>

              <div className="mt-4 flex items-center gap-2">
                <Link href={`/analises/${analysis.id}`} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full">
                    Abrir
                  </Button>
                </Link>
                <Link
                  href={`/explorar?analysisId=${analysis.id}&projectId=${id}`}
                  className="flex-1"
                >
                  <Button variant="outline" size="sm" className="w-full">
                    Editar
                  </Button>
                </Link>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  function renderDashboardCards(items: Dashboard[]) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((dashboard) => (
          <div
            key={dashboard.id}
            className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                <LayoutDashboard size={18} />
              </span>
              <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {dashboard.widgets.length} widget
                {dashboard.widgets.length !== 1 ? "s" : ""}
              </span>
            </div>

            <h3 className="mt-3 text-sm font-semibold text-slate-900 line-clamp-1">
              {dashboard.name}
            </h3>

            {dashboard.description && (
              <p className="mt-1 text-xs text-slate-500 line-clamp-2">
                {dashboard.description}
              </p>
            )}

            <p className="mt-3 text-xs text-slate-400">
              Atualizado em {formatDate(dashboard.updatedAt)}
            </p>

            <div className="mt-4">
              <Link href={`/paineis/${dashboard.id}`} className="block">
                <Button variant="outline" size="sm" className="w-full">
                  Abrir
                </Button>
              </Link>
            </div>
          </div>
        ))}
      </div>
    )
  }

  function renderEmpty(
    title: string,
    description: string,
    action: React.ReactNode
  ) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100">
          <Inbox size={20} className="text-slate-400" />
        </div>
        <h3 className="mt-3 text-sm font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>
        <div className="mt-5">{action}</div>
      </div>
    )
  }

  const outlineButton =
    "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900"

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Loading */}
      {project === null && !loadError && !notFound && (
        <section>
          <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white p-12">
            <Loader2 size={20} className="animate-spin text-slate-400" />
          </div>
        </section>
      )}

      {/* Load error */}
      {project === null && loadError && (
        <section>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-8 text-center">
            <div className="flex items-center justify-center gap-2 text-sm font-medium text-amber-800">
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
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-50">
              <Hospital size={24} className="text-teal-600" />
            </div>
            <h1 className="mt-4 text-sm font-semibold text-slate-900">
              Projeto não encontrado
            </h1>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
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

      {/* Workspace */}
      {project !== null && (
        <>
          {/* Header */}
          <section>
            <Link
              href="/projetos"
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-600 transition-colors"
            >
              <ArrowLeft size={14} />
              Projetos
            </Link>

            <div className="mt-3 flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-700">
                <Hospital size={22} />
              </span>
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                  {project.name}
                </h1>
                {project.description && (
                  <p className="mt-1 text-sm text-slate-500">
                    {project.description}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Tabs + ações */}
          <section className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <SegmentedTabs<WorkspaceTab>
              ariaLabel="Seções do projeto"
              value={tab}
              onChange={setTab}
              items={[
                { id: "overview", label: "Visão geral", icon: LayoutGrid },
                { id: "analyses", label: "Análises", icon: Table2 },
                { id: "charts", label: "Gráficos", icon: BarChart3 },
                { id: "dashboards", label: "Painéis", icon: LayoutDashboard },
              ]}
            />

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className={outlineButton}
                onClick={() => router.push(exploreHref)}
              >
                <Plus size={13} />
                Nova análise
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={outlineButton}
                onClick={() => router.push(exploreHref)}
              >
                <Plus size={13} />
                Novo gráfico
              </Button>
              <Button
                size="sm"
                className="bg-teal-600 text-white hover:bg-teal-700"
                onClick={() => setCreatePanelOpen(true)}
              >
                <Plus size={13} />
                Novo painel
              </Button>
            </div>
          </section>

          {/* Visão geral */}
          {tab === "overview" && (
            <section className="mt-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                    <Table2 size={18} />
                  </div>
                  <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
                    {analysisItems.length}
                  </p>
                  <p className="text-xs font-medium text-slate-500">
                    Análise{analysisItems.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50 text-purple-700">
                    <BarChart3 size={18} />
                  </div>
                  <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
                    {chartItems.length}
                  </p>
                  <p className="text-xs font-medium text-slate-500">
                    Gráfico{chartItems.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                    <LayoutDashboard size={18} />
                  </div>
                  <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
                    {dashboardItems.length}
                  </p>
                  <p className="text-xs font-medium text-slate-500">
                    Painel{dashboardItems.length !== 1 ? "is" : ""}
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-900">
                  Atividade recente
                </h2>

                {isEmptyWorkspace ? (
                  <div className="mt-3">
                    {renderEmpty(
                      "Projeto vazio",
                      "Comece criando uma análise, um gráfico ou um painel — tudo fica vinculado a este projeto automaticamente.",
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className={outlineButton}
                          onClick={() => router.push(exploreHref)}
                        >
                          <Plus size={13} />
                          Nova análise
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className={outlineButton}
                          onClick={() => router.push(exploreHref)}
                        >
                          <Plus size={13} />
                          Novo gráfico
                        </Button>
                        <Button
                          size="sm"
                          className="bg-teal-600 text-white hover:bg-teal-700"
                          onClick={() => setCreatePanelOpen(true)}
                        >
                          <Plus size={13} />
                          Novo painel
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 divide-y divide-slate-100">
                    {recentItems.map(renderActivityRow)}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Análises */}
          {tab === "analyses" && (
            <section className="mt-6">
              {analysisItems.length === 0
                ? renderEmpty(
                    "Nenhuma análise neste projeto",
                    "Análises (tabelas) salvas no Explorer com este projeto aparecem aqui.",
                    <Button
                      variant="outline"
                      size="sm"
                      className={outlineButton}
                      onClick={() => router.push(exploreHref)}
                    >
                      <Plus size={13} />
                      Nova análise
                    </Button>
                  )
                : renderAnalysisCards(analysisItems)}
            </section>
          )}

          {/* Gráficos */}
          {tab === "charts" && (
            <section className="mt-6">
              {chartItems.length === 0
                ? renderEmpty(
                    "Nenhum gráfico neste projeto",
                    "No Explorer, altere para “Visualizar” e use “Salvar gráfico” — ele nasce neste projeto.",
                    <Button
                      variant="outline"
                      size="sm"
                      className={outlineButton}
                      onClick={() => router.push(exploreHref)}
                    >
                      <Plus size={13} />
                      Novo gráfico
                    </Button>
                  )
                : renderAnalysisCards(chartItems)}
            </section>
          )}

          {/* Painéis */}
          {tab === "dashboards" && (
            <section className="mt-6">
              {dashboardItems.length === 0
                ? renderEmpty(
                    "Nenhum painel neste projeto",
                    "Crie um painel para organizar gráficos e análises deste projeto.",
                    <Button
                      size="sm"
                      className="bg-teal-600 text-white hover:bg-teal-700"
                      onClick={() => setCreatePanelOpen(true)}
                    >
                      <Plus size={13} />
                      Novo painel
                    </Button>
                  )
                : renderDashboardCards(dashboardItems)}
            </section>
          )}

          {/* Criação contextual de painel */}
          <CreateDashboardDialog
            open={createPanelOpen}
            onOpenChange={setCreatePanelOpen}
            projectId={id}
            onCreated={(dashboard) => router.push(`/paineis/${dashboard.id}`)}
          />
        </>
      )}
    </div>
  )
}
