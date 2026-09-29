"use client"

import React, { useCallback, useMemo, useRef, useState } from "react"
import { ChevronLeft } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { CHART_TYPES } from "@/lib/charts/chart-config"
import { CHART_TYPE_META } from "@/components/charts/chart-types"
import { PreviewChart } from "./preview-chart"
import { DraggableField } from "./draggable-field"
import { FieldDropSlot } from "./field-drop-slot"

export type { ChartType } from "@/lib/types/charts"
import type { ChartType } from "@/lib/types/charts"
export type ColumnType = "numeric" | "categorical"

export interface ColumnInfo {
  name: string
  type: ColumnType
}

export type VisualizationConfig = {
  chartType: Exclude<ChartType, "table">
  dimension: string | null
  metric: string | null
}

interface VisualizationPanelProps {
  data: Record<string, unknown>[]
  onBackToTable: () => void
  chartType: Exclude<ChartType, "table">
  onChartTypeChange: (value: Exclude<ChartType, "table">) => void
  dimension: string | null
  onDimensionChange: (value: string | null) => void
  metric: string | null
  onMetricChange: (value: string | null) => void
}

type SlotType = "dimension" | "metric"

const CHART_OPTIONS: {
  value: Exclude<ChartType, "table">
  label: string
  icon: LucideIcon
}[] = CHART_TYPES.map((type) => ({
  value: type,
  label: CHART_TYPE_META[type].label,
  icon: CHART_TYPE_META[type].icon,
}))

export function analyzeColumns(
  data: Record<string, unknown>[]
): ColumnInfo[] {
  const sample = data.slice(0, 100)
  const columnNames = Array.from(
    new Set(sample.flatMap((row) => Object.keys(row)))
  )

  return columnNames.map((name) => {
    const values = sample
      .map((row) => row[name])
      .filter((value) => value !== null && value !== undefined)

    if (values.length === 0 || values.every((value) => typeof value === "number")) {
      return { name, type: values.length === 0 ? "categorical" : "numeric" }
    }

    return { name, type: "categorical" }
  })
}

export function VisualizationPanel({
  data,
  onBackToTable,
  chartType,
  onChartTypeChange,
  dimension,
  onDimensionChange,
  metric,
  onMetricChange,
}: VisualizationPanelProps) {
  const columns = useMemo(() => analyzeColumns(data), [data])

  const [dragOverSlot, setDragOverSlot] = useState<SlotType | null>(null)
  const [dragError, setDragError] = useState<SlotType | null>(null)
  const dragErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const usedFields = useMemo(() => {
    const set = new Set<string>()
    if (dimension) set.add(dimension)
    if (metric) set.add(metric)
    return set
  }, [dimension, metric])

  const hasDimensionOptions = columns.some((c) => c.type === "categorical")
  const hasMetricOptions = columns.some((c) => c.type === "numeric")

  const hasValidMetricData =
    metric !== null &&
    data.some((row) => {
      const value = row[metric]
      return (
        value !== null &&
        value !== undefined &&
        typeof value === "number" &&
        Number.isFinite(value)
      )
    })

  const showDragError = useCallback((slot: SlotType) => {
    setDragError(slot)
    if (dragErrorTimer.current) clearTimeout(dragErrorTimer.current)
    dragErrorTimer.current = setTimeout(() => setDragError(null), 1500)
  }, [])

  function handleDragStart(e: React.DragEvent, columnName: string) {
    e.dataTransfer.setData("text/plain", columnName)
    e.dataTransfer.effectAllowed = "copy"
  }

  function handleDragOver(e: React.DragEvent, slot: SlotType) {
    e.preventDefault()
    e.dataTransfer.dropEffect = "copy"
    setDragOverSlot(slot)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    setDragOverSlot(null)
  }

  function handleDrop(e: React.DragEvent, slot: SlotType) {
    e.preventDefault()
    setDragOverSlot(null)

    const columnName = e.dataTransfer.getData("text/plain")
    if (!columnName) return

    const col = columns.find((c) => c.name === columnName)
    if (!col) return

    if (slot === "dimension" && col.type === "categorical") {
      onDimensionChange(columnName)
    } else if (slot === "metric" && col.type === "numeric") {
      onMetricChange(columnName)
    } else {
      showDragError(slot)
    }
  }

  function handleFieldClick(columnName: string) {
    if (usedFields.has(columnName)) return

    const col = columns.find((c) => c.name === columnName)
    if (!col) return

    if (col.type === "categorical" && !dimension) {
      onDimensionChange(columnName)
    } else if (col.type === "numeric" && !metric) {
      onMetricChange(columnName)
    }
  }

  return (
    <Card className="border-slate-200 bg-white">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Visualização</CardTitle>
          <p className="mt-1 text-sm text-slate-500">
            Arraste os campos para os slots ou clique para selecionar.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onBackToTable}
          className="shrink-0"
        >
          <ChevronLeft size={15} />
          Tabela
        </Button>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
          {/* Fields panel */}
          <div className="rounded-lg border border-slate-200 bg-white self-start">
            <div className="border-b border-slate-200 px-3 py-2">
              <span className="text-xs font-medium text-slate-600">Campos</span>
            </div>
            <div className="max-h-[320px] space-y-1.5 overflow-y-auto p-2">
              {columns.length === 0 && (
                <p className="px-2 py-3 text-xs text-slate-400">
                  Nenhum campo disponível.
                </p>
              )}
              {columns.map((col) => {
                const isUsed = usedFields.has(col.name)
                const kind = col.type === "numeric" ? "metric" : "dimension"
                return (
                  <DraggableField
                    key={col.name}
                    name={col.name}
                    kind={kind}
                    isUsed={isUsed}
                    onDragStart={handleDragStart}
                    onClick={handleFieldClick}
                  />
                )
              })}
            </div>
          </div>

          {/* Config panel */}
          <div className="space-y-4">
            {/* Chart type buttons */}
            <div>
              <span className="mb-1.5 block text-xs font-medium text-slate-600">
                Tipo de gráfico
              </span>
              <div className="flex flex-wrap gap-1.5">
                {CHART_OPTIONS.map((opt) => {
                  const Icon = opt.icon
                  const active = chartType === opt.value
                  return (
                    <Button
                      key={opt.value}
                      type="button"
                      variant={active ? "default" : "outline"}
                      size="sm"
                      onClick={() => onChartTypeChange(opt.value)}
                      className={
                        active ? "bg-teal-600 text-white hover:bg-teal-700" : ""
                      }
                    >
                      <Icon size={14} />
                      {opt.label}
                    </Button>
                  )
                })}
              </div>
            </div>

            {/* Dimension slot */}
            <div>
              <span className="mb-1.5 block text-xs font-medium text-slate-600">
                Dimensão
              </span>
              <FieldDropSlot
                value={dimension}
                label="Arraste um campo categórico aqui"
                dragOver={dragOverSlot === "dimension"}
                error={dragError === "dimension"}
                onDragOver={(e) => handleDragOver(e, "dimension")}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, "dimension")}
                onRemove={() => onDimensionChange(null)}
              />
            </div>

            {/* Metric slot */}
            <div>
              <span className="mb-1.5 block text-xs font-medium text-slate-600">
                Métrica
              </span>
              <FieldDropSlot
                value={metric}
                label="Arraste um campo numérico aqui"
                dragOver={dragOverSlot === "metric"}
                error={dragError === "metric"}
                onDragOver={(e) => handleDragOver(e, "metric")}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, "metric")}
                onRemove={() => onMetricChange(null)}
              />
            </div>

            {/* Validation messages */}
            <div className="space-y-1">
              {!hasDimensionOptions && (
                <p className="text-sm text-amber-700">
                  Nenhum campo categórico para dimensão
                </p>
              )}
              {!hasMetricOptions && (
                <p className="text-sm text-amber-700">
                  Nenhum campo numérico para métrica
                </p>
              )}
              {hasDimensionOptions &&
                hasMetricOptions &&
                dimension &&
                metric &&
                !hasValidMetricData && (
                  <p className="text-sm text-slate-500">
                    Nenhum dado válido para visualizar
                  </p>
                )}
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="h-[400px] rounded-lg border border-slate-200 bg-slate-50/50 p-3">
          <PreviewChart
            data={data}
            chartType={chartType}
            dimension={dimension}
            metric={metric}
          />
        </div>
      </CardContent>
    </Card>
  )
}
