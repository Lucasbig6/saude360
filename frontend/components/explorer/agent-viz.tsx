"use client"

import { useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import { PreviewChart } from "./preview-chart"
import { analyzeColumns } from "@/lib/explorer/columns"
import { chartTypeLabel, type VisualizationType } from "@/lib/types/charts"
import {
  presentationFromRows,
  type PresentationState,
} from "@/lib/explorer/workspace"

// Re-export de compatibilidade (a implementação vive em lib/explorer).
export { suggestViz, type VizSuggestion } from "@/lib/explorer/suggest-viz"

const AGENT_CHART_TYPES: VisualizationType[] = [
  "bar",
  "bar-horizontal",
  "line",
  "area",
  "pie",
  "donut",
  "scatter",
  "kpi",
]

const PREVIEW_LIMIT = 10

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—"
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

interface AgentVizProps {
  rows: Record<string, unknown>[]
  rowCount: number
  truncated: boolean
  executionMs?: number
  /**
   * Apresentação controlada (estado mora na página/workspace). Quando
   * ausente, o componente gerencia a sua própria apresentação a partir da
   * sugestão inicial (modo autônomo, comportamento original).
   */
  presentation?: PresentationState
  onPresentationChange?: (presentation: PresentationState) => void
}

/**
 * Visualização de um resultado tabular: tabela (amostra) com alternância
 * para gráfico (sugestão automática, ajuste manual de tipo, dimensão e
 * métrica). Campos de série/estilo vivem na aba Visual (mesmo estado).
 */
export function AgentViz({
  rows,
  rowCount,
  truncated,
  executionMs,
  presentation,
  onPresentationChange,
}: AgentVizProps) {
  const controlled = presentation !== undefined && onPresentationChange !== undefined

  const [internal, setInternal] = useState<PresentationState>(() =>
    presentationFromRows(rows)
  )
  const [prevRows, setPrevRows] = useState(rows)
  if (!controlled && prevRows !== rows) {
    setPrevRows(rows)
    setInternal(presentationFromRows(rows))
  }

  const active: PresentationState = controlled
    ? (presentation as PresentationState)
    : internal

  function patch(next: Partial<PresentationState>) {
    if (controlled) {
      onPresentationChange?.({ ...(presentation as PresentationState), ...next })
    } else {
      setInternal((prev) => ({ ...prev, ...next }))
    }
  }

  const { viewMode, chartType, dimension, metric, colorField, display } = active

  const columns = useMemo(() => analyzeColumns(rows), [rows])
  const dimensionOptions = useMemo(
    () =>
      columns
        .filter((c) => c.type === "categorical")
        .map((c) => c.name),
    [columns]
  )
  const metricOptions = useMemo(
    () => columns.filter((c) => c.type === "numeric").map((c) => c.name),
    [columns]
  )

  const suggestion = useMemo(() => presentationFromRows(rows), [rows])
  const effectiveDimension =
    dimension && dimensionOptions.includes(dimension)
      ? dimension
      : (suggestion.dimension ?? null)
  const effectiveMetric =
    metric && metricOptions.includes(metric) ? metric : (suggestion.metric ?? null)

  const visibleRows = rows.slice(0, PREVIEW_LIMIT)
  const tableColumns = rows.length > 0 ? Object.keys(rows[0]) : []

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex flex-col gap-2 border-b border-border bg-muted/40 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {rowCount} linha(s){truncated && " (amostra limitada)"}
          {executionMs !== undefined && ` · ${executionMs} ms`}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <div
            className="inline-flex rounded-md border border-border bg-card p-0.5"
            role="group"
            aria-label="Modo de visualização do resultado"
          >
            {(["table", "chart"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={viewMode === mode}
                onClick={() => patch({ viewMode: mode })}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                  viewMode === mode
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {mode === "table" ? "Tabela" : "Gráfico"}
              </button>
            ))}
          </div>
          {viewMode === "chart" && (
            <>
              <label className="sr-only" htmlFor={`agent-chart-${tableColumns[0]}`}>
                Tipo de gráfico
              </label>
              <select
                id={`agent-chart-${tableColumns[0]}`}
                value={chartType}
                onChange={(e) =>
                  patch({ chartType: e.target.value as VisualizationType })
                }
                className="h-7 rounded-md border border-border bg-card px-1.5 text-xs text-foreground"
              >
                {AGENT_CHART_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {chartTypeLabel[type]}
                  </option>
                ))}
              </select>
              {chartType !== "kpi" && (
                <>
                  <label className="sr-only" htmlFor="agent-dimension">
                    Dimensão
                  </label>
                  <select
                    id="agent-dimension"
                    value={effectiveDimension ?? ""}
                    onChange={(e) => patch({ dimension: e.target.value || null })}
                    className="h-7 max-w-32 rounded-md border border-border bg-card px-1.5 text-xs text-foreground"
                  >
                    {dimensionOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <label className="sr-only" htmlFor="agent-metric">
                    Métrica
                  </label>
                  <select
                    id="agent-metric"
                    value={effectiveMetric ?? ""}
                    onChange={(e) => patch({ metric: e.target.value || null })}
                    className="h-7 max-w-32 rounded-md border border-border bg-card px-1.5 text-xs text-foreground"
                  >
                    {metricOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {viewMode === "chart" ? (
        <div className="h-64 bg-card p-3">
          <PreviewChart
            data={rows}
            chartType={chartType}
            dimension={chartType === "kpi" ? null : effectiveDimension}
            metric={effectiveMetric}
            colorField={colorField}
            display={display}
          />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/60">
                  {tableColumns.map((column) => (
                    <th
                      key={column}
                      scope="col"
                      className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, index) => (
                  <tr key={index} className="border-b border-border last:border-0">
                    {tableColumns.map((column) => (
                      <td key={column} className="px-3 py-2 text-foreground">
                        {formatCell(row[column])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rowCount > visibleRows.length && (
            <p className="border-t border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
              Mostrando {visibleRows.length} de {rowCount} linha(s)
            </p>
          )}
        </>
      )}
    </div>
  )
}
