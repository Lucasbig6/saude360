"use client"

import { useMemo } from "react"
import { EChartRenderer } from "@/components/charts/EChartRenderer"
import type { ChartConfig } from "@/lib/charts/chart-config"
import type { ChartType } from "@/lib/types/charts"

interface PreviewChartProps {
  data: Record<string, unknown>[]
  chartType: Exclude<ChartType, "table">
  dimension: string | null
  metric: string | null
}

/**
 * Pré-visualização do Explorer (SQL → gráfico) na camada ECharts.
 */
export function PreviewChart({
  data,
  chartType,
  dimension,
  metric,
}: PreviewChartProps) {
  const rows = useMemo(() => {
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
  }, [data, metric])

  const config = useMemo<ChartConfig>(
    () => ({
      type: chartType,
      encoding: { x: dimension ?? undefined, y: metric ?? undefined },
      legend: true,
      tooltip: true,
    }),
    [chartType, dimension, metric]
  )

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
