"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Inbox,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
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

export default function AnalisesPage() {
  const [analyses, setAnalyses] = useState<Analysis[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [deleteTarget, setDeleteTarget] = useState<Analysis | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [addToDashboardTarget, setAddToDashboardTarget] =
    useState<Analysis | null>(null)

  useEffect(() => {
    let cancelled = false

    getAnalyses()
      .then((list) => {
        if (!cancelled) setAnalyses(list)
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(
          err instanceof ApiError
            ? err.detail
            : "Erro ao carregar as análises."
        )
      })

    return () => {
      cancelled = true
    }
  }, [reloadKey])

  function handleRetry() {
    setAnalyses(null)
    setLoadError(null)
    setReloadKey((key) => key + 1)
  }

  const chartItems = (analyses ?? []).filter((a) => a.chartType !== "table")
  const analysisItems = (analyses ?? []).filter((a) => a.chartType === "table")

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError(null)

    try {
      await deleteAnalysis(deleteTarget.id)
      setAnalyses((prev) =>
        (prev ?? []).filter((a) => a.id !== deleteTarget.id)
      )
      setDeleteTarget(null)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // já não existe: o estado desejado está alcançado
        setAnalyses((prev) =>
          (prev ?? []).filter((a) => a.id !== deleteTarget.id)
        )
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
              className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg",
                    isChart
                      ? "bg-purple-50 text-purple-700"
                      : "bg-teal-50 text-teal-700"
                  )}
                >
                  <Icon size={18} />
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
                      isChart
                        ? "bg-purple-50 text-purple-700"
                        : "bg-teal-50 text-teal-700"
                    )}
                  >
                    {kindLabel(analysis)}
                  </span>
                  <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {chartTypeLabel[analysis.chartType]}
                  </span>
                </div>
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

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Link
                  href={`/analises/${analysis.id}`}
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
                  href={
                    `/explorar?analysisId=${analysis.id}` +
                    (analysis.projectId ? `&projectId=${analysis.projectId}` : "")
                  }
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
                  className="shrink-0 text-slate-500 hover:text-red-600"
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
      <section>
        <Link
          href="/explorar"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-600 transition-colors"
        >
          <ArrowLeft size={14} />
          Voltar ao Explorer
        </Link>

        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
          Minhas Análises
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Consultas salvas e gráficos reutilizáveis no Explorer.
        </p>
      </section>

      {/* Loading */}
      {analyses === null && !loadError && (
        <section className="mt-8">
          <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white p-12">
            <Loader2 size={20} className="animate-spin text-slate-400" />
          </div>
        </section>
      )}

      {/* Load error */}
      {analyses === null && loadError && (
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
      {analyses !== null && analyses.length === 0 ? (
        <section className="mt-8">
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <Inbox size={24} className="text-slate-400" />
            </div>
            <h2 className="mt-4 text-sm font-semibold text-slate-900">
              Nenhum item salvo
            </h2>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              Execute uma query no Explorer e salve uma análise (tabela) ou um
              gráfico para reutilizar depois.
            </p>
            <Link href="/explorar" className="mt-6">
              <Button className="bg-teal-600 text-white hover:bg-teal-700">
                <Search size={16} />
                Criar análise
              </Button>
            </Link>
          </div>
        </section>
      ) : analyses !== null ? (
        <>
          {/* Análises (tabela) */}
          <section className="mt-6">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900">
                Análises
              </h2>
              <span className="inline-flex items-center rounded-md bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">
                {analysisItems.length}
              </span>
            </div>
            {analysisItems.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                Nenhuma análise (tabela) salva ainda.
              </p>
            ) : (
              <div className="mt-4">{renderCards(analysisItems)}</div>
            )}
          </section>

          {/* Gráficos */}
          <section className="mt-8">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900">
                Gráficos
              </h2>
              <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
                {chartItems.length}
              </span>
            </div>
            {chartItems.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
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
          deleteTarget?.chartType === "table"
            ? "Excluir análise"
            : "Excluir gráfico"
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
