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
import { AlertCircle, CheckCircle, ChevronLeft, ChevronRight, Database, Inbox, LayoutDashboard, Loader2, Save } from "lucide-react"
import {
  VisualizationPanel,
  type VisualizationType,
  analyzeColumns,
} from "@/components/explorer/visualization-panel"
import { SaveAnalysisDialog } from "@/components/explorer/save-analysis-dialog"
import { PublishDatasetDialog } from "@/components/explorer/publish-dataset-dialog"
import { createAnalysis, updateAnalysis } from "@/lib/api/analyses"
import { buildAnalysisPayload } from "@/lib/explorer/analysis-payload"
import type { Analysis } from "@/lib/types/analysis"
import type { ChartConfig } from "@/lib/charts/chart-config"
import {
  DEFAULT_DISPLAY_OPTIONS,
  chartConfigToDisplay,
  type ChartDisplayOptions,
} from "@/lib/charts/display-options"
import { ApiError } from "@/lib/api"
import { AddToDashboardDialog } from "@/components/dashboard/add-to-dashboard-dialog"
import { suggestCoordinateFields } from "@/lib/charts/map-data"

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
  /** Chamado após criar/atualizar — usado para atualizar listas (ex.: rail). */
  onAnalysisSaved?: (analysis: Analysis) => void
  onDatasetPublished?: (datasetId: number) => void
  /** Reexecuta a última consulta a partir do estado de erro. */
  onRetry?: () => void
}

export function QueryResult({ data, loading, error, sql, databaseId, dbSchema, datasetId, projectId, editingAnalysis, onAnalysisSaved, onDatasetPublished, onRetry }: QueryResultProps) {
  const [page, setPage] = useState(0)
  const [prevData, setPrevData] = useState(data)
  const [viewMode, setViewMode] = useState<"table" | "chart">("table")
  const containerRef = useRef<HTMLDivElement>(null)
  const [chartType, setChartType] = useState<VisualizationType>("bar")
  const [dimension, setDimension] = useState<string | null>(null)
  const [metric, setMetric] = useState<string | null>(null)
  const [colorField, setColorField] = useState<string | null>(null)
  const [display, setDisplay] = useState<ChartDisplayOptions>(
    DEFAULT_DISPLAY_OPTIONS
  )

  if (prevData !== data) {
    setPrevData(data)
    setPage(0)
  }

  const columns = useMemo(
    () => (data ? analyzeColumns(data) : []),
    [data]
  )
  const dimensionOptions = useMemo(
    () =>
      columns
        .filter((c) =>
          chartType === "map" ? c.type === "numeric" : c.type === "categorical"
        )
        .map((c) => ({ value: c.name, label: c.name })),
    [chartType, columns]
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

  // Coluna de série só vale se existir nos dados atuais (evita série órfã
  // quando a consulta muda).
  const effectiveColorField = useMemo(
    () => (colorField && columns.some((c) => c.name === colorField) ? colorField : null),
    [colorField, columns]
  )

  function handleChartTypeChange(value: VisualizationType) {
    setChartType(value)
    if (value === "map") {
      const numericFields = columns
        .filter((column) => column.type === "numeric")
        .map((column) => column.name)
      const coordinates = suggestCoordinateFields(numericFields)
      setDimension(coordinates.longitude)
      setMetric(coordinates.latitude)
    } else if (chartType === "map") {
      setDimension(
        columns.find((column) => column.type === "categorical")?.name ?? null
      )
      setMetric(
        columns.find((column) => column.type === "numeric")?.name ?? null
      )
    }
  }

  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [savingAnalysis, setSavingAnalysis] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [publishDialogOpen, setPublishDialogOpen] = useState(false)
  const [addToDashboardOpen, setAddToDashboardOpen] = useState(false)
  const [savedAnalysis, setSavedAnalysis] = useState<Analysis | null>(
    editingAnalysis ?? null
  )
  const isChartMode = viewMode === "chart"

  // Restaura a visualização da análise editada (chartType/dimension/metric):
  // a prop chega assíncrona depois da montagem, então aplica uma única vez
  // via ajuste no render (mesmo padrão de `prevData` acima).
  const [appliedEditing, setAppliedEditing] = useState<Analysis | null>(null)
  if (editingAnalysis && appliedEditing !== editingAnalysis) {
    setAppliedEditing(editingAnalysis)
    setSavedAnalysis(editingAnalysis)
    if (editingAnalysis.chartType === "table") {
      setViewMode("table")
    } else {
      setChartType(editingAnalysis.chartType)
      setDimension(editingAnalysis.dimension)
      setMetric(editingAnalysis.metric)
      setViewMode("chart")
      applySavedChartConfig(editingAnalysis.chartConfig)
    }
  }

  /**
   * Restaura a apresentação salva (série/cor, rótulos, cores, ordenação...).
   * Chamada durante o render pelo bloco acima — mesmo padrão de `prevData`.
   */
  function applySavedChartConfig(config: ChartConfig | null) {
    setColorField(config?.encoding?.color ?? null)
    setDisplay(chartConfigToDisplay(config))
  }

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

    const isChart = viewMode !== "table"
    const payload = buildAnalysisPayload({
      name,
      description,
      projectId: selectedProjectId,
      workspace: {
        rows: data ?? [],
        rowCount: data?.length ?? 0,
        truncated: false,
        sql: sql ?? null,
        source: "sql",
        databaseId: databaseId ?? null,
        dbSchema: dbSchema ?? null,
        datasetId: datasetId ?? null,
      },
      presentation: {
        chartType,
        dimension: isChart ? effectiveDimension : null,
        metric: isChart ? effectiveMetric : null,
        colorField: isChart ? effectiveColorField : null,
        display,
        viewMode,
      },
    })

    try {
      // Edição (?analysisId restaurado) atualiza a mesma análise; sem edição, cria.
      const saved = editingAnalysis
        ? await updateAnalysis(editingAnalysis.id, payload)
        : await createAnalysis(payload)
      setSavedAnalysis(saved)
      onAnalysisSaved?.(saved)
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
      <div
        role="status"
        className="rounded-lg border border-border bg-card p-4"
      >
        <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" />
          Executando consulta...
        </div>
        {/* Skeleton da tabela enquanto a query roda. */}
        <div className="space-y-2" aria-hidden="true">
          <div className="h-8 animate-pulse rounded bg-border/70" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-6">
        <div className="flex items-start gap-3">
          <AlertCircle size={20} className="mt-0.5 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-medium text-destructive">
              Erro ao executar consulta
            </p>
            <p className="mt-1 text-sm text-destructive">{error}</p>
            {onRetry && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4 border-destructive/40 bg-card text-destructive hover:bg-destructive/15"
                onClick={onRetry}
              >
                Tentar novamente
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-border bg-card p-12">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
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
        <span key={`dots-${i}`} className="px-1 text-xs text-muted-foreground">
          ...
        </span>
      ) : (
        <Button
          key={p}
          variant={p === page + 1 ? "default" : "outline"}
          size="icon-xs"
          aria-label={`Página ${p}`}
          aria-current={p === page + 1 ? "page" : undefined}
          onClick={() => goToPage(p - 1)}
        >
          {p}
        </Button>
      )
    )
  }

  return (
    <div ref={containerRef} className="bg-card">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs text-muted-foreground">
          {data.length} registro{data.length !== 1 ? "s" : ""}
        </span>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div
            className="inline-flex w-full gap-1 rounded-lg border border-border bg-muted p-1 sm:w-auto"
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
            onClick={() => setAddToDashboardOpen(true)}
            disabled={!savedAnalysis}
            title={savedAnalysis ? "Adicionar ao painel" : "Salve a análise antes de adicioná-la a um painel"}
            className="shrink-0"
          >
            <LayoutDashboard size={14} />
            Adicionar ao painel
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
        <div className="flex items-center gap-2 border-b border-primary/25 bg-primary/10 px-4 py-2 text-sm text-primary">
          <CheckCircle size={16} />
          {isChartMode ? "Gráfico salvo com sucesso." : "Análise salva com sucesso."}
        </div>
      )}

      {viewMode === "chart" ? (
        <VisualizationPanel
          data={data}
          onBackToTable={() => setViewMode("table")}
          chartType={chartType}
          onChartTypeChange={handleChartTypeChange}
          dimension={dimension}
          onDimensionChange={setDimension}
          metric={metric}
          onMetricChange={setMetric}
          colorField={effectiveColorField}
          onColorFieldChange={setColorField}
          display={display}
          onDisplayChange={setDisplay}
        />
      ) : (
        <>
          {/* Mobile Card Layout */}
          <div className="lg:hidden px-4 py-4 space-y-3">
        {pageData.map((row, i) => (
          <div key={start + i} className="rounded-lg border border-border bg-card p-4">
            {tableColumns.map((col) => (
              <div key={col} className="flex justify-between py-1.5 border-b border-border last:border-0">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {col}
                </span>
                <span className="text-sm text-foreground font-mono text-right max-w-[60%] truncate">
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
              <TableRow className="border-b-2 border-b-border hover:bg-muted/50">
                {tableColumns.map((col) => (
                  <TableHead
                    key={col}
                    className="bg-muted/50 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {col}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageData.map((row, i) => (
                <TableRow key={start + i} className="even:bg-muted/50/50">
                  {tableColumns.map((col, colIdx) => (
                    <TableCell
                      key={col}
                      className={cn(
                        "px-4 py-3 text-sm text-foreground",
                        colIdx < tableColumns.length - 1 && "border-r border-r-border"
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
        <nav
          aria-label="Paginação dos resultados"
          className={cn("flex items-center justify-between border-t border-border px-4 py-2", "flex-col sm:flex-row gap-2 sm:gap-0")}
        >
          <span className="text-xs text-muted-foreground">
            Exibindo {start + 1}–{Math.min(end, data.length)} de {data.length}
          </span>

          {/* Mobile: setas + números */}
          <div className="flex sm:hidden items-center gap-1 w-full justify-end">
            <Button
              variant="outline"
              size="icon-xs"
              aria-label="Página anterior"
              onClick={() => goToPage(page - 1)}
              disabled={page === 0}
            >
              <ChevronLeft size={14} />
            </Button>
            {renderPageNumbers()}
            <Button
              variant="outline"
              size="icon-xs"
              aria-label="Próxima página"
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
              aria-label="Página anterior"
              onClick={() => goToPage(page - 1)}
              disabled={page === 0}
            >
              <ChevronLeft size={14} />
            </Button>
            {renderPageNumbers()}
            <Button
              variant="outline"
              size="icon-xs"
              aria-label="Próxima página"
              onClick={() => goToPage(page + 1)}
              disabled={page === totalPages - 1}
            >
              <ChevronRight size={14} />
            </Button>
          </div>
        </nav>
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
        defaultProjectId={editingAnalysis?.projectId ?? projectId ?? null}
        initialName={editingAnalysis?.name ?? ""}
        initialDescription={editingAnalysis?.description ?? ""}
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
      <AddToDashboardDialog
        open={addToDashboardOpen}
        onOpenChange={setAddToDashboardOpen}
        analysis={savedAnalysis}
      />
    </div>
  )
}
