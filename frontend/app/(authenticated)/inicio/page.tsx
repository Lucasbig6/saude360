"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  BarChart3,
  ChevronDown,
  Database,
  FileChartColumn,
  Hospital,
  LayoutDashboard,
  Loader2,
  Plus,
  Search,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { Dashboard } from "@/lib/types/dashboard"
import type { Analysis } from "@/lib/types/analysis"
import type { Project } from "@/lib/types/project"
import { chartTypeIcon, chartTypeLabel } from "@/lib/types/charts"
import { getDashboards } from "@/lib/api/dashboards"
import { getAnalyses } from "@/lib/api/analyses"
import { getProjects } from "@/lib/api/projects"
import {
  listDatasets,
  datasetDisplayName,
  type DatasetListItem,
} from "@/lib/api/datasets"
import { ApiError } from "@/lib/api"

type RecentKind = "dashboard" | "analysis" | "chart"

interface RecentItem {
  id: string
  kind: RecentKind
  name: string
  updatedAt: string
  href: string
}

interface SearchHit {
  id: string
  kind: RecentKind | "dataset"
  name: string
  detail: string
  href: string
  chartType?: Analysis["chartType"]
}

const RECENT_LIMIT = 8

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
    return formatDate(iso)
  } catch {
    return iso
  }
}

function kindLabel(kind: RecentKind | "dataset"): string {
  switch (kind) {
    case "dashboard":
      return "Dashboard"
    case "analysis":
      return "Análise"
    case "chart":
      return "Gráfico"
    case "dataset":
      return "Dataset"
  }
}

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

function Section({
  title,
  count,
  open,
  onToggle,
  actions,
  children,
}: {
  title: string
  count?: number
  open: boolean
  onToggle: () => void
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="border-b border-slate-200/80 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-3 py-3.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="group flex min-w-0 items-center gap-2 text-left"
        >
          <ChevronDown
            size={15}
            className={cn(
              "shrink-0 text-slate-400 transition-transform duration-200",
              open ? "rotate-0" : "-rotate-90"
            )}
          />
          <h2 className="text-sm font-semibold tracking-tight text-slate-800">
            {title}
          </h2>
          {typeof count === "number" && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-100 px-1.5 text-[11px] font-medium text-slate-600">
              {count}
            </span>
          )}
        </button>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {open && <div className="pb-4">{children}</div>}
    </section>
  )
}

function EmptyInline({
  title,
  description,
  actionLabel,
  actionHref,
}: {
  title: string
  description: string
  actionLabel: string
  actionHref: string
}) {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 text-center">
      <p className="text-sm font-medium text-slate-800">{title}</p>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
      <Link href={actionHref} className="mt-3 inline-block">
        <Button size="sm" variant="outline" className="bg-white">
          {actionLabel}
        </Button>
      </Link>
    </div>
  )
}

function EntryCard({
  href,
  icon,
  iconClassName,
  title,
  description,
  createHref,
  createLabel,
}: {
  href: string
  icon: React.ReactNode
  iconClassName: string
  title: string
  description: string
  createHref: string
  createLabel: string
}) {
  return (
    <div className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-teal-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
            iconClassName
          )}
        >
          {icon}
        </span>
        <span className="shrink-0 text-slate-300 transition-colors group-hover:text-teal-600">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M9 6l6 6-6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
      <h3 className="mt-4 text-base font-semibold tracking-tight text-slate-900">
        {title}
      </h3>
      <p className="mt-1 text-sm leading-relaxed text-slate-500">
        {description}
      </p>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <Link
          href={href}
          className="text-xs font-medium text-teal-700 transition-colors hover:text-teal-800"
        >
          Ver todos →
        </Link>
        <Link
          href={createHref}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <Plus size={12} />
          {createLabel}
        </Link>
      </div>
    </div>
  )
}

function ListRow({
  href,
  icon,
  iconClassName,
  title,
  meta,
  badge,
  badgeClassName,
  right,
}: {
  href?: string
  icon: React.ReactNode
  iconClassName?: string
  title: string
  meta?: string
  badge?: string
  badgeClassName?: string
  right?: React.ReactNode
}) {
  const content = (
    <>
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
          iconClassName ?? "bg-slate-100 text-slate-600"
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-900">
          {title}
        </span>
        {meta && (
          <span className="mt-0.5 block truncate text-xs text-slate-500">
            {meta}
          </span>
        )}
      </span>
      {badge && (
        <span
          className={cn(
            "hidden shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium sm:inline-flex",
            badgeClassName ?? "bg-slate-100 text-slate-600"
          )}
        >
          {badge}
        </span>
      )}
      {right}
    </>
  )

  if (href) {
    return (
      <Link
        href={href}
        className="group flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-slate-50"
      >
        {content}
        <span className="shrink-0 text-slate-300 transition-colors group-hover:text-teal-600">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M9 6l6 6-6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </Link>
    )
  }

  return (
    <div className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-slate-50">
      {content}
      {right}
    </div>
  )
}

function RecentCard({
  href,
  icon,
  iconClassName,
  title,
  timeLabel,
  badge,
}: {
  href: string
  icon: React.ReactNode
  iconClassName: string
  title: string
  timeLabel: string
  badge: string
}) {
  return (
    <Link
      href={href}
      className="group flex h-full flex-col rounded-lg border border-slate-200/60 bg-slate-50/60 p-3 transition-colors hover:border-teal-300 hover:bg-white"
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
            iconClassName
          )}
        >
          {icon}
        </span>
        <span className="rounded-md bg-white/80 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200/70">
          {badge}
        </span>
      </div>
      <h3 className="mt-2 line-clamp-2 text-[13px] font-semibold tracking-tight text-slate-900">
        {title}
      </h3>
      <div className="mt-auto flex items-center justify-between pt-2">
        <span className="text-[11px] text-slate-500">{timeLabel}</span>
        <span className="shrink-0 text-slate-300 transition-colors group-hover:text-teal-600">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M9 6l6 6-6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
    </Link>
  )
}

export default function Home() {
  const [query, setQuery] = useState("")
  const [dashboards, setDashboards] = useState<Dashboard[]>([])
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [loadingDomain, setLoadingDomain] = useState(true)
  const [domainError, setDomainError] = useState<string | null>(null)
  const [datasets, setDatasets] = useState<DatasetListItem[]>([])
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [recentOpen, setRecentOpen] = useState(true)

  function toggleRecent() {
    setRecentOpen((prev) => !prev)
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [dashboardList, analysisList] = await Promise.all([
          getDashboards(),
          getAnalyses(),
        ])
        if (!cancelled) {
          setDashboards(dashboardList)
          setAnalyses(analysisList)
          setDomainError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setDomainError(
            err instanceof ApiError
              ? err.detail
              : "Erro ao carregar painéis e análises."
          )
        }
      } finally {
        if (!cancelled) setLoadingDomain(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const data = await listDatasets()
        if (!cancelled) setDatasets(data.result ?? [])
      } catch {
        if (!cancelled) setDatasets([])
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  // Projetos: falha silenciosa (mesmo precedente dos datasets) — o bloco
  // simplesmente não aparece se a API de projetos estiver indisponível.
  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const list = await getProjects()
        if (!cancelled) setProjects(list)
      } catch {
        if (!cancelled) setProjects([])
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const sortedDashboards = useMemo(
    () =>
      [...dashboards].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [dashboards]
  )

  const recentProjects = useMemo(
    () =>
      [...(projects ?? [])]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 3),
    [projects]
  )

  const recentItems = useMemo<RecentItem[]>(() => {
    const fromDashboards: RecentItem[] = sortedDashboards.map((d) => ({
      id: d.id,
      kind: "dashboard" as const,
      name: d.name,
      updatedAt: d.updatedAt,
      href: `/paineis/${d.id}`,
    }))

    const fromAnalyses: RecentItem[] = analyses.map((a) => ({
      id: a.id,
      kind: a.chartType === "table" ? ("analysis" as const) : ("chart" as const),
      name: a.name,
      updatedAt: a.updatedAt,
      href: `/analises/${a.id}`,
    }))

    return [...fromDashboards, ...fromAnalyses]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, RECENT_LIMIT)
  }, [sortedDashboards, analyses])

  const searchHits = useMemo<SearchHit[]>(() => {
    const trimmed = query.trim()
    if (!trimmed) return []

    const hits: SearchHit[] = []

    for (const d of sortedDashboards) {
      const hay = `${d.name} ${d.description}`
      if (matchesQuery(hay, trimmed)) {
        hits.push({
          id: `dashboard-${d.id}`,
          kind: "dashboard",
          name: d.name,
          detail: d.description,
          href: `/paineis/${d.id}`,
        })
      }
    }

    for (const a of analyses) {
      const hay = `${a.name} ${a.description} ${chartTypeLabel[a.chartType]}`
      if (matchesQuery(hay, trimmed)) {
        hits.push({
          id: `${a.chartType === "table" ? "analysis" : "chart"}-${a.id}`,
          kind: a.chartType === "table" ? "analysis" : "chart",
          name: a.name,
          detail: chartTypeLabel[a.chartType],
          href: `/analises/${a.id}`,
          chartType: a.chartType,
        })
      }
    }

    for (const ds of datasets) {
      const name = datasetDisplayName(ds)
      const hay = `${name} ${ds.description ?? ""} ${ds.table_name}`
      if (matchesQuery(hay, trimmed)) {
        hits.push({
          id: `dataset-${ds.id}`,
          kind: "dataset",
          name,
          detail: ds.description || ds.table_name,
          href: `/explorar?datasetId=${ds.id}`,
        })
      }
    }

    return hits.slice(0, 12)
  }, [query, sortedDashboards, analyses, datasets])

  const trimmedQuery = query.trim()
  const showSearchResults = trimmedQuery.length > 0

  return (
    <>
    {/* Hero: intro + busca */}
    <div className="border-b">
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 bg-[url('/images/hero.png')] bg-cover bg-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-teal-600">
          Saude360
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-[28px]">
          O que você deseja analisar?
        </h1>
        <p className="mt-1.5 text-sm text-slate-500">
          Pesquise dashboards, gráficos, análises ou dados.
        </p>

        <div className="relative mt-4 max-w-2xl">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar dashboards, gráficos, análises ou dados..."
            aria-label="Pesquisar na plataforma"
            className="h-10 rounded-lg border-slate-200 bg-white pl-9 pr-5 text-sm shadow-sm placeholder:text-slate-400 focus-visible:ring-teal-500/40"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Limpar busca"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded px-1.5 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            >
              Limpar
            </button>
          )}
        </div>
      </section>
    </div>

    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Cards de entrada — atalhos por área */}
      <section aria-label="Atalhos por área" className="pt-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <EntryCard
            href="/paineis"
            icon={<LayoutDashboard size={20} />}
            iconClassName="bg-teal-100 text-teal-700"
            title="Dashboards"
            description="Painéis para acompanhamento de indicadores."
            createHref="/paineis"
            createLabel="Novo"
          />
          <EntryCard
            href="/analises"
            icon={<BarChart3 size={20} />}
            iconClassName="bg-purple-100 text-purple-700"
            title="Análises e gráficos"
            description="Consultas, tabelas analíticas e visualizações salvas."
            createHref="/explorar"
            createLabel="Nova"
          />
          <EntryCard
            href="/explorar"
            icon={<Database size={20} />}
            iconClassName="bg-sky-100 text-sky-700"
            title="Conjuntos de dados"
            description="Dados prontos para exploração e análise."
            createHref="/fontes"
            createLabel="Fontes"
          />
        </div>
      </section>

      {loadingDomain ? (
        <section className="pt-6" aria-label="Carregando painéis e análises">
          <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin text-teal-600" />
            Carregando painéis e análises...
          </div>
        </section>
      ) : domainError ? (
        <section className="pt-6" aria-label="Erro ao carregar">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
            {domainError}
          </div>
        </section>
      ) : showSearchResults ? (
        <section className="pt-6" aria-label="Resultados da busca">
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900">
                Resultados para “{trimmedQuery}”
              </h2>
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-100 px-1.5 text-[11px] font-medium text-slate-600">
                {searchHits.length}
              </span>
            </div>
          </div>

          {searchHits.length === 0 ? (
            <div className="mt-4">
              <EmptyInline
                title="Nenhum resultado encontrado"
                description="Tente outro termo ou use os atalhos acima."
                actionLabel="Explorar dados"
                actionHref="/explorar"
              />
            </div>
          ) : (
            <div className="mt-2 divide-y divide-slate-100">
              {searchHits.map((hit) => {
                const Icon =
                  hit.kind === "dashboard"
                    ? LayoutDashboard
                    : hit.kind === "dataset"
                      ? Database
                      : hit.kind === "analysis"
                        ? FileChartColumn
                        : hit.chartType
                          ? chartTypeIcon[hit.chartType]
                          : BarChart3

                const iconCls =
                  hit.kind === "dataset"
                    ? "bg-sky-50 text-sky-700"
                    : hit.kind === "chart"
                      ? "bg-purple-50 text-purple-700"
                      : hit.kind === "dashboard"
                        ? "bg-teal-50 text-teal-700"
                        : "bg-slate-100 text-slate-700"

                return (
                  <ListRow
                    key={hit.id}
                    href={hit.href}
                    icon={<Icon size={15} />}
                    iconClassName={iconCls}
                    title={hit.name}
                    meta={hit.detail || undefined}
                    badge={kindLabel(hit.kind)}
                  />
                )
              })}
            </div>
          )}
        </section>
      ) : (
        <div className="mt-6 border-t border-slate-200 pt-2">
          {/* Projetos — resumo da atividade */}
          <section aria-label="Projetos" className="border-b border-slate-200/80">
            <div className="flex flex-wrap items-center justify-between gap-3 py-3.5">
              <h2 className="text-sm font-semibold tracking-tight text-slate-800">
                Projetos
              </h2>
              <Link
                href="/projetos"
                className="text-xs font-medium text-teal-700 transition-colors hover:text-teal-800"
              >
                Ver todos os projetos →
              </Link>
            </div>

            {projects !== null &&
              (recentProjects.length === 0 ? (
                <p className="pb-3.5 text-xs text-slate-500">
                  Nenhum projeto ainda.{" "}
                  <Link
                    href="/projetos"
                    className="font-medium text-teal-700 transition-colors hover:text-teal-800"
                  >
                    Criar um projeto
                  </Link>{" "}
                  para organizar análises, gráficos e painéis.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 pb-1">
                  {recentProjects.map((project) => (
                    <ListRow
                      key={project.id}
                      href={`/projetos/${project.id}`}
                      icon={<Hospital size={15} />}
                      iconClassName="bg-teal-50 text-teal-700"
                      title={project.name}
                      meta={project.description || undefined}
                      right={
                        <span className="shrink-0 text-xs text-slate-400">
                          {formatRelative(project.updatedAt)}
                        </span>
                      }
                    />
                  ))}
                </div>
              ))}
          </section>
        </div>
      )}
    </div>
    </>
  )
}
