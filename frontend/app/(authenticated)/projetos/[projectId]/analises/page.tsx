"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  BarChart3,
  Inbox,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import { cn } from "@/lib/utils"
import type { Analysis } from "@/lib/types/analysis"
import { chartTypeLabel, chartTypeIcon } from "@/lib/types/charts"
import { DeleteConfirmationDialog } from "@/components/shared/delete-confirmation-dialog"
import { AddToDashboardDialog } from "@/components/dashboard/add-to-dashboard-dialog"
import { getAnalyses, deleteAnalysis } from "@/lib/api/analyses"
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

function AnalisesContent({ projectId }: { projectId: string }) {
  // Chave derivada: "carregando" = ausência de resultado para a chave atual
  // (escopo de projeto + recarga), evitando setState síncrono no efeito.
  const [analysesLoad, setAnalysesLoad] = useState<{
    key: string
    items: Analysis[]
    error: string | null
  } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [deleteTarget, setDeleteTarget] = useState<Analysis | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [addToDashboardTarget, setAddToDashboardTarget] =
    useState<Analysis | null>(null)

  const loadKey = `${projectId}#${reloadKey}`

  useEffect(() => {
    let cancelled = false

    getAnalyses(projectId)
      .then((list) => {
        if (cancelled) return
        const items = list
        setAnalysesLoad({ key: loadKey, items, error: null })
      })
      .catch((err) => {
        if (cancelled) return
        setAnalysesLoad({
          key: loadKey,
          items: [],
          error:
            err instanceof ApiError
              ? err.detail
              : "Erro ao carregar as análises.",
        })
      })

    return () => {
      cancelled = true
    }
  }, [loadKey, projectId])

  const currentLoad = analysesLoad?.key === loadKey ? analysesLoad : null
  const loadError = currentLoad?.error ?? null
  const analyses = currentLoad ? currentLoad.items : null
  const loading = currentLoad === null

  function handleRetry() {
    setReloadKey((key) => key + 1)
  }

  function patchItems(updater: (items: Analysis[]) => Analysis[]) {
    setAnalysesLoad((prev) =>
      prev && prev.key === loadKey
        ? { ...prev, items: updater(prev.items) }
        : prev
    )
  }

  const chartItems = (analyses ?? []).filter((a) => a.chartType !== "table")
  const analysisItems = (analyses ?? []).filter((a) => a.chartType === "table")

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError(null)

    try {
      await deleteAnalysis(deleteTarget.id)
      patchItems((items) => items.filter((a) => a.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // já não existe: o estado desejado está alcançado
        patchItems((items) => items.filter((a) => a.id !== deleteTarget.id))
        setDeleteTarget(null)
      } else {
        setDeleteError(
          err instanceof ApiError ? err.detail : "Erro ao excluir."
        )
      }
    } finally {
      setDeleting(false)
    }
  }

  function kindLabel(item: Analysis): string {
    return item.chartType === "table" ? "Análise" : "Gráfico"
  }

  function renderCards(items: Analysis[]) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((analysis) => {
          const Icon = chartTypeIcon[analysis.chartType]
          const isChart = analysis.chartType !== "table"

          return (
            <div
              key={analysis.id}
              className="group rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/40"
            >
              <div className="flex items-start justify-between">
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg",
                    isChart
                      ? "bg-chart-4/10 text-chart-4"
                      : "bg-primary/10 text-primary"
                  )}
                >
                  <Icon size={18} />
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge
                    className={
                      isChart
                        ? "bg-chart-4/10 text-chart-4"
                        : "bg-primary/10 text-primary"
                    }
                  >
                    {kindLabel(analysis)}
                  </Badge>
                  <Badge variant="secondary">
                    {chartTypeLabel[analysis.chartType]}
                  </Badge>
                </div>
              </div>

              <h3 className="mt-3 text-sm font-semibold text-foreground line-clamp-1">
                {analysis.name}
              </h3>

              {analysis.description && (
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                  {analysis.description}
                </p>
              )}

              <p className="mt-3 text-xs text-muted-foreground">
                Atualizado em {formatDate(analysis.updatedAt)}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Link
                  href={`/projetos/${projectId}/analises/${analysis.id}`}
                  className="min-w-[7rem] flex-1"
                >
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                  >
                    Abrir
                  </Button>
                </Link>
                <Link
                  href={`/projetos/${projectId}/explorar?analysisId=${analysis.id}`}
                  className="min-w-[7rem] flex-1"
                >
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                  >
                    <Pencil size={13} />
                    Editar
                  </Button>
                </Link>
                {isChart && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAddToDashboardTarget(analysis)}
                    className="w-full sm:w-auto"
                  >
                    <BarChart3 size={13} />
                    Adicionar ao painel
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setDeleteTarget(analysis)}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <PageHeader
        title="Análises"
        description="Consultas salvas e gráficos reutilizáveis do Explorer."
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
      {analyses !== null && analyses.length === 0 ? (
        <section className="mt-8">
          <EmptyState
            icon={Inbox}
            title="Nenhum item salvo"
            description="Execute uma query no Explorer e salve uma análise (tabela) ou um gráfico para reutilizar depois."
            action={
              <Link href={`/projetos/${projectId}/explorar`}>
                <Button>
                  <Search size={16} />
                  Criar análise
                </Button>
              </Link>
            }
          />
        </section>
      ) : analyses !== null ? (
        <>
          {/* Análises (tabela) */}
          <section className="mt-6">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">
                Análises
              </h2>
              <Badge className="bg-primary/10 text-primary">
                {analysisItems.length}
              </Badge>
            </div>
            {analysisItems.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Nenhuma análise (tabela) salva ainda.
              </p>
            ) : (
              <div className="mt-4">{renderCards(analysisItems)}</div>
            )}
          </section>

          {/* Gráficos */}
          <section className="mt-8">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">
                Gráficos
              </h2>
              <Badge className="bg-chart-4/10 text-chart-4">
                {chartItems.length}
              </Badge>
            </div>
            {chartItems.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Nenhum gráfico salvo ainda. No Explorer, altere para
                &quot;Visualizar&quot; e use &quot;Salvar gráfico&quot;.
              </p>
            ) : (
              <div className="mt-4">{renderCards(chartItems)}</div>
            )}
          </section>
        </>
      ) : null}

      {/* Delete confirmation dialog */}
      <DeleteConfirmationDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null)
            setDeleteError(null)
          }
        }}
        title={
          deleteTarget?.chartType === "table" ? "Excluir análise" : "Excluir gráfico"
        }
        itemName={deleteTarget?.name ?? ""}
        loading={deleting}
        error={deleteError}
        onConfirm={handleDelete}
      />

      <AddToDashboardDialog
        open={addToDashboardTarget !== null}
        onOpenChange={(open) => {
          if (!open) setAddToDashboardTarget(null)
        }}
        analysis={addToDashboardTarget}
      />
    </div>
  )
}

export default function AnalisesPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = use(params)
  return <AnalisesContent projectId={projectId} />
}
