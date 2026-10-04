"use client"

import { useMemo } from "react"
import { EChartRenderer } from "@/components/charts/EChartRenderer"
import type { ChartConfig, ChartSort } from "@/lib/charts/chart-config"
import {
  DEFAULT_DISPLAY_OPTIONS,
  paletteColors,
  type ChartDisplayOptions,
} from "@/lib/charts/display-options"
import { kpiValue } from "@/lib/types/widgets"
import type { VisualizationType } from "./visualization-panel"

interface PreviewChartProps {
  data: Record<string, unknown>[]
  chartType: VisualizationType
  dimension: string | null
  metric: string | null
  /** Campo de agrupamento (série/cor). Opcional. */
  colorField?: string | null
  /** Opções de apresentação das abas Rótulos/Estilo. */
  display?: ChartDisplayOptions
}

export function buildConfig(
  chartType: VisualizationType,
  dimension: string | null,
  metric: string | null,
  colorField: string | null,
  display: ChartDisplayOptions
): ChartConfig {
  const config: ChartConfig = {
    type: chartType === "kpi" ? "bar" : chartType,
    encoding: {
      x: dimension ?? undefined,
      y: metric ?? undefined,
      ...(colorField ? { color: colorField } : {}),
    },
    legend: display.legend,
    tooltip: true,
  }

  if (display.title.trim()) config.title = display.title.trim()
  if (display.xAxisLabel.trim()) config.xAxisLabel = display.xAxisLabel.trim()
  if (display.yAxisLabel.trim()) config.yAxisLabel = display.yAxisLabel.trim()
  if (display.numberFormat !== DEFAULT_DISPLAY_OPTIONS.numberFormat) {
    config.numberFormat = display.numberFormat
  }
  if (display.showValues) config.showValues = true
  if (display.legendPosition !== DEFAULT_DISPLAY_OPTIONS.legendPosition) {
    config.legendPosition = display.legendPosition
  }
  if (display.stacked) config.stacked = true
  if (display.smooth) config.smooth = true
  if (display.exportable) config.exportable = true

  const colors = display.colors ?? paletteColors(display.palette)
  if (colors) config.colors = colors

  if (display.sortField) {
    const sort: ChartSort = {
      field: display.sortField,
      direction: display.sortDirection,
    }
    config.sort = sort
  }
  if (display.limit !== null && display.limit > 0) {
    config.limit = display.limit
  }

  return config
}

/**
 * Pré-visualização do Explorer (SQL → gráfico) na camada ECharts.
 */
export function PreviewChart({
  data,
  chartType,
  dimension,
  metric,
  colorField = null,
  display,
}: PreviewChartProps) {
  const options = display ?? DEFAULT_DISPLAY_OPTIONS

  const kpi = useMemo(
    () =>
      kpiValue(data, {
        type: "kpi",
        field: metric ?? undefined,
        function: metric ? "sum" : "count",
      }),
    [data, metric]
  )

  const rows = useMemo(() => {
    if (chartType === "map") return data
    if (!metric) return []
    return data.filter((row) => {
      const value = row[metric]
      return (
        value !== null &&
        value !== undefined &&
        typeof value === "number" &&
        Number.isFinite(value)
      )
    })
  }, [chartType, data, metric])

  const config = useMemo(
    () => buildConfig(chartType, dimension, metric, colorField, options),
    [chartType, dimension, metric, colorField, options]
  )

  if (chartType === "kpi") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <span className="text-5xl font-semibold tabular-nums text-teal-700">
          {kpi === null
            ? "—"
            : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(kpi)}
        </span>
        <span className="text-sm text-slate-500">
          {metric ?? "Registros"} · {metric ? "Soma" : "Contagem"}
        </span>
      </div>
    )
  }

  if (chartType === "map" && (!dimension || !metric)) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-6 text-center">
        <p className="text-sm text-slate-500">
          Selecione as colunas de longitude e latitude.
        </p>
      </div>
    )
  }

  if (!dimension || !metric || rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-6 text-center">
        <p className="text-sm text-slate-500">
          Nenhum dado válido para visualizar.
        </p>
      </div>
    )
  }

  return <EChartRenderer config={config} rows={rows} className="h-full w-full" />
}
