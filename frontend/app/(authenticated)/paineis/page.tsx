"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  AlertCircle,
  History,
  Inbox,
  Loader2,
  Plus,
  RefreshCw,
  Share2,
  User,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import { SegmentedTabs } from "@/components/ui/segmented-tabs"
import type { Dashboard } from "@/lib/types/dashboard"
import type { Project } from "@/lib/types/project"
import { DeleteConfirmationDialog } from "@/components/shared/delete-confirmation-dialog"
import { CreateDashboardDialog } from "@/components/dashboard/create-dashboard-dialog"
import { DashboardCard } from "@/components/dashboard/dashboard-card"
import { getDashboards, deleteDashboard } from "@/lib/api/dashboards"
import { getProjects } from "@/lib/api/projects"
import { getMe } from "@/lib/auth"
import { dashboardHref } from "@/lib/routes"
import { readRecentIds } from "@/lib/recent"
import { ApiError } from "@/lib/api"

type LibraryTab = "meus" | "compartilhados" | "recentes"

interface LibraryLoad {
  key: number
  items: Dashboard[]
  meId: string | null
  projects: Record<string, string>
  recentIds: string[]
  error: string | null
}

/**
 * Biblioteca global de painéis: todos os dashboards do usuário (inclusive os
 * que ainda não pertencem a um projeto), divididos entre os que ele criou e
 * os que vieram de outras pessoas/projetos.
 */
export default function PaineisPage() {
  const router = useRouter()

  // Chave derivada: "carregando" = ausência de resultado para a recarga atual,
  // evitando setState síncrono no efeito.
  const [load, setLoad] = useState<LibraryLoad | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [tab, setTab] = useState<LibraryTab>("meus")
  const [deleteTarget, setDeleteTarget] = useState<Dashboard | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    let cancelled = false

    Promise.all([
      getDashboards(),
      getProjects().catch(() => [] as Project[]),
      getMe().catch(() => null),
    ])
      .then(([items, projects, me]) => {
        if (cancelled) return
        setLoad({
          key: reloadKey,
          items,
          meId: me?.id ?? null,
          projects: Object.fromEntries(projects.map((p) => [p.id, p.name])),
          recentIds: readRecentIds("dashboard"),
          error: null,
        })
      })
      .catch((err) => {
        if (cancelled) return
        setLoad({
          key: reloadKey,
          items: [],
          meId: null,
          projects: {},
          recentIds: readRecentIds("dashboard"),
          error:
            err instanceof ApiError
              ? err.detail
              : "Erro ao carregar os dashboards.",
        })
      })

    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const currentLoad = load?.key === reloadKey ? load : null
  const loadError = currentLoad?.error ?? null
  const loading = currentLoad === null

  const buckets = useMemo(() => {
    const recentIds = currentLoad?.recentIds ?? []
    const meId = currentLoad?.meId ?? null
    const byRecency = (a: Dashboard, b: Dashboard) => {
      const ia = recentIds.indexOf(a.id)
      const ib = recentIds.indexOf(b.id)
      if (ia !== ib) {
        return (ia === -1 ? Number.MAX_SAFE_INTEGER : ia) -
          (ib === -1 ? Number.MAX_SAFE_INTEGER : ib)
      }
      return b.updatedAt.localeCompare(a.updatedAt)
    }
    const byUpdated = (a: Dashboard, b: Dashboard) =>
      b.updatedAt.localeCompare(a.updatedAt)

    const meus = (currentLoad?.items ?? [])
      .filter((d) => meId === null || d.createdBy === meId)
      .sort(byUpdated)
    const compartilhados = (currentLoad?.items ?? [])
      .filter((d) => meId !== null && d.createdBy !== meId)
      .sort(byUpdated)
    const recentes = [...(currentLoad?.items ?? [])].sort(byRecency)

    return { meus, compartilhados, recentes }
  }, [currentLoad])

  const visible = buckets[tab]

  function handleRetry() {
    setReloadKey((key) => key + 1)
  }

  function patchItems(updater: (items: Dashboard[]) => Dashboard[]) {
    setLoad((prev) =>
      prev && prev.key === reloadKey ? { ...prev, items: updater(prev.items) } : prev
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

  const emptyCopy: Record<
    LibraryTab,
    { title: string; description: string }
  > = {
    meus: {
      title: "Você ainda não criou nenhum painel",
      description:
        "Crie um dashboard para reunir gráficos e análises em um painel personalizado.",
    },
    compartilhados: {
      title: "Nenhum painel compartilhado",
      description:
        "Painéis criados por outras pessoas e os herdados de projetos aparecem aqui.",
    },
    recentes: {
      title: "Nenhum painel aberto recentemente",
      description:
        "Os painéis que você abrir ficam nesta lista para acesso rápido.",
    },
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <PageHeader
        title="Painéis"
        description="Sua biblioteca de dashboards: os seus, os compartilhados e os recentes."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={16} />
            Novo dashboard
          </Button>
        }
      />

      <div className="mt-6">
        <SegmentedTabs
          ariaLabel="Filtrar painéis"
          value={tab}
          onChange={setTab}
          items={[
            {
              id: "meus",
              label: `Meus (${buckets.meus.length})`,
              icon: User,
            },
            {
              id: "compartilhados",
              label: `Compartilhados (${buckets.compartilhados.length})`,
              icon: Share2,
            },
            {
              id: "recentes",
              label: `Recentes (${buckets.recentes.length})`,
              icon: History,
            },
          ]}
        />
      </div>

      {loading && !loadError && (
        <section className="mt-8">
          <div className="flex items-center justify-center rounded-lg border border-border bg-card p-12">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        </section>
      )}

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

      {!loading && visible.length === 0 ? (
        <section className="mt-8">
          <EmptyState
            icon={Inbox}
            title={emptyCopy[tab].title}
            description={emptyCopy[tab].description}
            action={
              <Button onClick={() => setCreateOpen(true)}>
                <Plus size={16} />
                Novo dashboard
              </Button>
            }
          />
        </section>
      ) : !loading ? (
        <section className="mt-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((dashboard) => (
              <DashboardCard
                key={dashboard.id}
                dashboard={dashboard}
                projectName={
                  dashboard.projectId
                    ? (currentLoad?.projects[dashboard.projectId] ?? null)
                    : ""
                }
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        </section>
      ) : null}

      <CreateDashboardDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(dashboard) => router.push(dashboardHref(dashboard))}
      />

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
