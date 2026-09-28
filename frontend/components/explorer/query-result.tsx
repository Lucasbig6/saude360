"use client"

import { useMemo, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { AlertCircle, CheckCircle, ChevronLeft, ChevronRight, Database, Inbox, Loader2, Save } from "lucide-react"
import {
  VisualizationPanel,
  type ChartType,
  analyzeColumns,
} from "@/components/explorer/visualization-panel"
import { SaveAnalysisDialog } from "@/components/explorer/save-analysis-dialog"
import { PublishDatasetDialog } from "@/components/explorer/publish-dataset-dialog"
import { createAnalysis, updateAnalysis } from "@/lib/api/analyses"
import type { Analysis } from "@/lib/types/analysis"
import { ApiError } from "@/lib/api"

const PAGE_SIZE = 10

interface QueryResultProps {
  data: Record<string, unknown>[] | null
  loading: boolean
  error: string | null
  sql?: string
  databaseId?: number
  dbSchema?: string | null
  datasetId?: number | null
  /** Vem de `/explorar?projectId=`: semeia o projeto selecionado no diálogo. */
  projectId?: string
  /**
   * Análise restaurada via `?analysisId=`: quando presente, Salvar atualiza
   * (PUT) em vez de criar duplicata, e pré-preenche nome/descrição/projeto.
   */
  editingAnalysis?: Analysis | null
  onDatasetPublished?: (datasetId: number) => void
}

export function QueryResult({ data, loading, error, sql, databaseId, dbSchema, datasetId, projectId, editingAnalysis, onDatasetPublished }: QueryResultProps) {
  const [page, setPage] = useState(0)
  const [prevData, setPrevData] = useState(data)
  const [viewMode, setViewMode] = useState<"table" | "chart">("table")
  const containerRef = useRef<HTMLDivElement>(null)

  if (prevData !== data) {
    setPrevData(data)
    setPage(0)
  }

  const [chartType, setChartType] = useState<Exclude<ChartType, "table">>("bar")
  const [dimension, setDimension] = useState<string | null>(null)
  const [metric, setMetric] = useState<string | null>(null)

  const columns = useMemo(
    () => (data ? analyzeColumns(data) : []),
    [data]
  )
  const dimensionOptions = useMemo(
    () =>
      columns
        .filter((c) => c.type === "categorical")
        .map((c) => ({ value: c.name, label: c.name })),
    [columns]
  )
  const metricOptions = useMemo(
    () =>
      columns
        .filter((c) => c.type === "numeric")
        .map((c) => ({ value: c.name, label: c.name })),
    [columns]
  )

  const effectiveDimension = useMemo(() => {
    if (dimension && dimensionOptions.some((o) => o.value === dimension)) {
      return dimension
    }
    return dimensionOptions[0]?.value ?? null
  }, [dimension, dimensionOptions])

  const effectiveMetric = useMemo(() => {
    if (metric && metricOptions.some((o) => o.value === metric)) {
      return metric
    }
    return metricOptions[0]?.value ?? null
  }, [metric, metricOptions])

  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [savingAnalysis, setSavingAnalysis] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [publishDialogOpen, setPublishDialogOpen] = useState(false)
  const isChartMode = viewMode === "chart"

  function goToPage(p: number) {
    setPage(p)
    containerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  async function handleSaveAnalysis(
    name: string,
    description: string,
    selectedProjectId: string | null
  ) {
    setSavingAnalysis(true)
    setSaveError(null)

    const payload = {
      name,
      description,
      sql: sql ?? "",
      databaseId: databaseId ?? null,
      dbSchema: dbSchema ?? null,
      datasetId: datasetId ?? null,
      chartType: viewMode === "table" ? "table" : chartType,
      dimension: viewMode === "table" ? null : effectiveDimension,
      metric: viewMode === "table" ? null : effectiveMetric,
      // string -> associa; null -> sem vínculo (create) / remove vínculo (update)
      projectId: selectedProjectId,
    }

    try {
      // Edição (?analysisId restaurado) atualiza a mesma análise; sem edição, cria.
      if (editingAnalysis) {
        await updateAnalysis(editingAnalysis.id, payload)
      } else {
        await createAnalysis(payload)
      }
      setSaveDialogOpen(false)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      setSaveError(
        err instanceof ApiError ? err.detail : "Erro ao salvar a análise."
      )
      throw err
    } finally {
      setSavingAnalysis(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-slate-200 bg-white p-12">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <Loader2 size={20} className="animate-spin" />
          Executando consulta...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <div className="flex items-start gap-3">
          <AlertCircle size={20} className="mt-0.5 shrink-0 text-red-500" />
          <div>
            <p className="text-sm font-medium text-red-800">
              Erro ao executar consulta
            </p>
            <p className="mt-1 text-sm text-red-600">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-slate-200 bg-white p-12">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <Inbox size={20} />
          Nenhum resultado retornado.
        </div>
      </div>
    )
  }

  const tableColumns = Object.keys(data[0])
  const totalPages = Math.ceil(data.length / PAGE_SIZE)
  const start = page * PAGE_SIZE
  const end = start + PAGE_SIZE
  const pageData = data.slice(start, end)

  function getPageNumbers(): (number | "...")[] {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1)
    }

    const pages: (number | "...")[] = []

    pages.push(1)

    if (page > 3) {
      pages.push("...")
    }

    const windowStart = Math.max(2, page)
    const windowEnd = Math.min(totalPages - 1, page + 2)

    for (let i = windowStart; i <= windowEnd; i++) {
      pages.push(i)
    }

    if (page < totalPages - 4) {
      pages.push("...")
    }

    pages.push(totalPages)

    return pages
  }

  const pageNumbers = getPageNumbers()

  function renderPageNumbers() {
    return pageNumbers.map((p, i) =>
      p === "..." ? (
        <span key={`dots-${i}`} className="px-1 text-xs text-slate-400">
          ...
        </span>
      ) : (
        <Button
          key={p}
          variant={p === page + 1 ? "default" : "outline"}
          size="icon-xs"
          onClick={() => goToPage(p - 1)}
        >
          {p}
        </Button>
      )
    )
  }

  return (
    <div ref={containerRef} className="rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs text-slate-500">
          {data.length} registro{data.length !== 1 ? "s" : ""}
        </span>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div
            className="inline-flex w-full gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 sm:w-auto"
            role="group"
            aria-label="Modo de visualização"
          >
            <Button
              type="button"
              variant={viewMode === "table" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("table")}
              aria-pressed={viewMode === "table"}
              className="flex-1 sm:flex-none"
            >
              Tabela
            </Button>
            <Button
              type="button"
              variant={viewMode === "chart" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("chart")}
              aria-pressed={viewMode === "chart"}
              className="flex-1 sm:flex-none"
            >
              Visualizar
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSaveDialogOpen(true)}
            className="shrink-0"
          >
            <Save size={14} />
            {isChartMode ? "Salvar gráfico" : "Salvar análise"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPublishDialogOpen(true)}
            className="shrink-0"
          >
            <Database size={14} />
            Salvar como Dataset
          </Button>
        </div>
      </div>

      {saveSuccess && (
        <div className="flex items-center gap-2 border-b border-teal-200 bg-teal-50 px-4 py-2 text-sm text-teal-700">
          <CheckCircle size={16} />
          {isChartMode ? "Gráfico salvo com sucesso." : "Análise salva com sucesso."}
        </div>
      )}

      {viewMode === "chart" ? (
        <VisualizationPanel
          data={data}
          onBackToTable={() => setViewMode("table")}
          chartType={chartType}
          onChartTypeChange={setChartType}
          dimension={dimension}
          onDimensionChange={setDimension}
          metric={metric}
          onMetricChange={setMetric}
        />
      ) : (
        <>
          {/* Mobile Card Layout */}
          <div className="lg:hidden px-4 py-4 space-y-3">
        {pageData.map((row, i) => (
          <div key={start + i} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            {tableColumns.map((col) => (
              <div key={col} className="flex justify-between py-1.5 border-b border-slate-100 last:border-0">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                  {col}
                </span>
                <span className="text-sm text-slate-900 font-mono text-right max-w-[60%] truncate">
                  {row[col] === null || row[col] === undefined ? "—" : String(row[col])}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Desktop Table Layout */}
      <div className="hidden lg:block">
        <div className="max-h-[500px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b-2 border-b-slate-300 hover:bg-slate-50">
                {tableColumns.map((col) => (
                  <TableHead
                    key={col}
                    className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600"
                  >
                    {col}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageData.map((row, i) => (
                <TableRow key={start + i} className="even:bg-slate-50/50">
                  {tableColumns.map((col, colIdx) => (
                    <TableCell
                      key={col}
                      className={cn(
                        "px-4 py-3 text-sm text-slate-700",
                        colIdx < tableColumns.length - 1 && "border-r border-r-slate-100"
                      )}
                    >
                      {row[col] === null || row[col] === undefined
                        ? "—"
                        : String(row[col])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className={cn("flex items-center justify-between border-t border-slate-200 px-4 py-2", "flex-col sm:flex-row gap-2 sm:gap-0")}>
          <span className="text-xs text-slate-500">
            {data.length} registro{data.length !== 1 ? "s" : ""}
          </span>

          {/* Mobile: setas + números */}
          <div className="flex sm:hidden items-center gap-1 w-full justify-end">
            <Button
              variant="outline"
              size="icon-xs"
              onClick={() => goToPage(page - 1)}
              disabled={page === 0}
            >
              <ChevronLeft size={14} />
            </Button>
            {renderPageNumbers()}
            <Button
              variant="outline"
              size="icon-xs"
              onClick={() => goToPage(page + 1)}
              disabled={page === totalPages - 1}
            >
              <ChevronRight size={14} />
            </Button>
          </div>

          {/* Desktop: setas + números */}
          <div className="hidden sm:flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-xs"
              onClick={() => goToPage(page - 1)}
              disabled={page === 0}
            >
              <ChevronLeft size={14} />
            </Button>
            {renderPageNumbers()}
            <Button
              variant="outline"
              size="icon-xs"
              onClick={() => goToPage(page + 1)}
              disabled={page === totalPages - 1}
            >
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}
        </>
      )}

      <SaveAnalysisDialog
        open={saveDialogOpen}
        onOpenChange={(next) => {
          if (!next) setSaveError(null)
          setSaveDialogOpen(next)
        }}
        onSave={handleSaveAnalysis}
        saving={savingAnalysis}
        error={saveError}
        title={isChartMode ? "Salvar gráfico" : "Salvar análise"}
        dialogDescription={
          isChartMode
            ? "Dê um nome para este gráfico para reutilizá-lo no Dashboard depois."
            : "Dê um nome para esta análise para encontrá-la facilmente depois."
        }
      />
      <PublishDatasetDialog
        open={publishDialogOpen}
        onOpenChange={setPublishDialogOpen}
        sql={sql ?? ""}
        databaseId={databaseId ?? 0}
        dbSchema={dbSchema ?? null}
        onSuccess={(id) => {
          setPublishDialogOpen(false)
          onDatasetPublished?.(id)
        }}
      />
    </div>
  )
}
