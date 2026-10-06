"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  AlertCircle,
  BarChart3,
  Inbox,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Dashboard } from "@/lib/types/dashboard"
import { DeleteConfirmationDialog } from "@/components/shared/delete-confirmation-dialog"
import { CreateDashboardDialog } from "@/components/dashboard/create-dashboard-dialog"
import {
  getDashboards,
  deleteDashboard,
} from "@/lib/api/dashboards"
import { getProjects } from "@/lib/api/projects"
import type { Project } from "@/lib/types/project"
import {
  ProjectFilter,
  projectFilterHref,
  projectFilterLabel,
  readProjectFilter,
  type ProjectFilterValue,
} from "@/components/project/project-filter"
import { ApiError } from "@/lib/api"

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

function PaineisContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectFilter = readProjectFilter(searchParams.get("project"))

  // Chave derivada: "carregando" = ausência de resultado para a chave atual
  // (escopo de projeto + recarga), evitando setState síncrono no efeito.
  const [dashboardsLoad, setDashboardsLoad] = useState<{
    key: string
    items: Dashboard[]
    error: string | null
  } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Dashboard | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const loadKey = `${projectFilter}#${reloadKey}`
  const scopedProjectId =
    projectFilter !== "all" && projectFilter !== "none" ? projectFilter : undefined

  useEffect(() => {
    let cancelled = false

    getDashboards(scopedProjectId)
      .then((list) => {
        if (cancelled) return
        // "none" não tem equivalente na API -> filtrado aqui.
        const items =
          projectFilter === "none"
            ? list.filter((item) => item.projectId === null)
            : list
        setDashboardsLoad({ key: loadKey, items, error: null })
      })
      .catch((err) => {
        if (cancelled) return
        setDashboardsLoad({
          key: loadKey,
          items: [],
          error:
            err instanceof ApiError
              ? err.detail
              : "Erro ao carregar os dashboards.",
        })
      })

    return () => {
      cancelled = true
    }
  }, [loadKey, projectFilter, scopedProjectId])

  useEffect(() => {
    let cancelled = false
    getProjects()
      .then((list) => {
        if (!cancelled) setProjects(list)
      })
      .catch(() => {
        // O filtro continua funcional sem a lista de nomes.
        if (!cancelled) setProjects([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const currentLoad = dashboardsLoad?.key === loadKey ? dashboardsLoad : null
  const loadError = currentLoad?.error ?? null
  const dashboards = currentLoad ? currentLoad.items : null
  const loading = currentLoad === null

  function handleRetry() {
    setReloadKey((key) => key + 1)
  }

  function handleFilterChange(value: ProjectFilterValue) {
    router.replace(projectFilterHref("/paineis", value, searchParams), {
      scroll: false,
    })
  }

  function patchItems(updater: (items: Dashboard[]) => Dashboard[]) {
    setDashboardsLoad((prev) =>
      prev && prev.key === loadKey
        ? { ...prev, items: updater(prev.items) }
        : prev
    )
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError(null)

    try {
      await deleteDashboard(deleteTarget.id)
      patchItems((items) => items.filter((d) => d.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        patchItems((items) => items.filter((d) => d.id !== deleteTarget.id))
        setDeleteTarget(null)
      } else {
        setDeleteError(
          err instanceof ApiError ? err.detail : "Erro ao excluir o painel."
        )
      }
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <section>
        <Link
          href="/inicio"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-600 transition-colors"
        >
          <BarChart3 size={14} />
          Início
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Painéis
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Dashboards personalizados com visualizações arrastáveis.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="hidden text-xs text-slate-500 sm:inline">
              {projectFilter === "all"
                ? "Todos os projetos"
                : projectFilterLabel(projectFilter, projects ?? [])}
            </span>
            <ProjectFilter
              value={projectFilter}
              onChange={handleFilterChange}
              projects={projects ?? []}
              loading={projects === null}
            />
            <Button
              onClick={() => setCreateOpen(true)}
              className="bg-teal-600 text-white hover:bg-teal-700"
            >
              <Plus size={16} />
              Novo dashboard
            </Button>
          </div>
        </div>
      </section>

      {/* Loading */}
      {loading && !loadError && (
        <section className="mt-8">
          <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white p-12">
            <Loader2 size={20} className="animate-spin text-slate-400" />
          </div>
        </section>
      )}

      {/* Load error */}
      {loading && loadError && (
        <section className="mt-8">
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

      {/* Empty state */}
      {dashboards !== null && dashboards.length === 0 ? (
        <section className="mt-8">
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <Inbox size={24} className="text-slate-400" />
            </div>
            <h2 className="mt-4 text-sm font-semibold text-slate-900">
              {projectFilter === "all"
                ? "Nenhum dashboard criado"
                : "Nenhum painel neste escopo"}
            </h2>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              {projectFilter === "all"
                ? "Crie seu primeiro dashboard para organizar gráficos e análises em um painel personalizado."
                : projectFilter === "none"
                  ? "Nenhum painel sem projeto. Escolha outro projeto no filtro acima."
                  : "Nenhum painel neste projeto. Crie um novo — ele já nasce vinculado a ele."}
            </p>
            <Button
              onClick={() => setCreateOpen(true)}
              className="mt-6 bg-teal-600 text-white hover:bg-teal-700"
            >
              <Plus size={16} />
              Novo dashboard
            </Button>
          </div>
        </section>
      ) : dashboards !== null ? (
        /* Dashboard cards */
        <section className="mt-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {dashboards.map((dashboard) => (
              <div
                key={dashboard.id}
                className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                    <BarChart3 size={18} />
                  </div>
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

                <div className="mt-4 flex items-center gap-2">
                  <Link
                    href={`/paineis/${dashboard.id}`}
                    className="flex-1"
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                    >
                      Abrir
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => setDeleteTarget(dashboard)}
                    className="shrink-0 text-slate-500 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Create dialog */}
      <CreateDashboardDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectId={scopedProjectId}
        onCreated={(dashboard) => {
          patchItems((items) => [...items, dashboard])
          router.push(`/paineis/${dashboard.id}`)
        }}
      />

      {/* Delete confirmation dialog */}
      <DeleteConfirmationDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null)
            setDeleteError(null)
          }
        }}
        title="Excluir dashboard"
        itemName={deleteTarget?.name ?? ""}
        loading={deleting}
        error={deleteError}
        onConfirm={handleDelete}
      />
    </div>
  )
}

export default function PaineisPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center p-12">
            <Loader2 size={20} className="animate-spin text-slate-400" />
          </div>
        </div>
      }
    >
      <PaineisContent />
    </Suspense>
  )
}
