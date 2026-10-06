"use client"

import { use, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  AlertCircle,
  Inbox,
  Loader2,
  Plus,
  RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/shared/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import type { Dashboard } from "@/lib/types/dashboard"
import { DeleteConfirmationDialog } from "@/components/shared/delete-confirmation-dialog"
import { CreateDashboardDialog } from "@/components/dashboard/create-dashboard-dialog"
import { DashboardCard } from "@/components/dashboard/dashboard-card"
import {
  getDashboards,
  deleteDashboard,
} from "@/lib/api/dashboards"
import { ApiError } from "@/lib/api"

function PaineisContent({ projectId }: { projectId: string }) {
  const router = useRouter()

  // Chave derivada: "carregando" = ausência de resultado para a chave atual
  // (escopo de projeto + recarga), evitando setState síncrono no efeito.
  const [dashboardsLoad, setDashboardsLoad] = useState<{
    key: string
    items: Dashboard[]
    error: string | null
  } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [deleteTarget, setDeleteTarget] = useState<Dashboard | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const loadKey = `${projectId}#${reloadKey}`

  useEffect(() => {
    let cancelled = false

    getDashboards(projectId)
      .then((list) => {
        if (cancelled) return
        const items = list
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
  }, [loadKey, projectId])

  const currentLoad = dashboardsLoad?.key === loadKey ? dashboardsLoad : null
  const loadError = currentLoad?.error ?? null
  const dashboards = currentLoad ? currentLoad.items : null
  const loading = currentLoad === null

  function handleRetry() {
    setReloadKey((key) => key + 1)
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
      <PageHeader
        title="Painéis"
        description="Dashboards personalizados com visualizações arrastáveis."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={16} />
            Novo dashboard
          </Button>
        }
      />

      {/* Loading */}
      {loading && !loadError && (
        <section className="mt-8">
          <div className="flex items-center justify-center rounded-lg border border-border bg-card p-12">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        </section>
      )}

      {/* Load error */}
      {loading && loadError && (
        <section className="mt-8">
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

      {/* Empty state */}
      {dashboards !== null && dashboards.length === 0 ? (
        <section className="mt-8">
          <EmptyState
            icon={Inbox}
            title="Nenhum dashboard criado"
            description="Crie seu primeiro dashboard para organizar gráficos e análises em um painel personalizado."
            action={
              <Button onClick={() => setCreateOpen(true)}>
                <Plus size={16} />
                Novo dashboard
              </Button>
            }
          />
        </section>
      ) : dashboards !== null ? (
        /* Dashboard cards */
        <section className="mt-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {dashboards.map((dashboard) => (
              <DashboardCard
                key={dashboard.id}
                dashboard={dashboard}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* Create dialog */}
      <CreateDashboardDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectId={projectId}
        onCreated={(dashboard) => {
          patchItems((items) => [...items, dashboard])
          router.push(`/projetos/${projectId}/paineis/${dashboard.id}`)
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

export default function PaineisPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = use(params)
  return <PaineisContent projectId={projectId} />
}
