"use client"

import React, { useCallback, useMemo, useRef, useState } from "react"
import { ChevronLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { CHART_TYPES } from "@/lib/charts/chart-config"
import type {
  ChartLegendPosition,
  ChartNumberFormat,
} from "@/lib/charts/chart-config"
import {
  DEFAULT_DISPLAY_OPTIONS,
  PALETTES,
  type ChartDisplayOptions,
} from "@/lib/charts/display-options"
import { chartTypeLabel } from "@/lib/types/charts"
import { PreviewChart } from "./preview-chart"
import { DraggableField } from "./draggable-field"
import { FieldDropSlot } from "./field-drop-slot"

export type { ChartType } from "@/lib/types/charts"
import type { ChartType } from "@/lib/types/charts"
export type VisualizationType = Exclude<ChartType, "table"> | "kpi"
export type ColumnType = "numeric" | "categorical"

// Reexporta as opções de display para os consumidores do painel.
export {
  DEFAULT_DISPLAY_OPTIONS,
  PALETTES,
  paletteColors,
  type ChartDisplayOptions,
} from "@/lib/charts/display-options"

export interface ColumnInfo {
  name: string
  type: ColumnType
}

export type VisualizationConfig = {
  chartType: VisualizationType
  dimension: string | null
  metric: string | null
}

interface VisualizationPanelProps {
  data: Record<string, unknown>[]
  onBackToTable: () => void
  chartType: VisualizationType
  onChartTypeChange: (value: VisualizationType) => void
  dimension: string | null
  onDimensionChange: (value: string | null) => void
  metric: string | null
  onMetricChange: (value: string | null) => void
  /** Campo que separa as séries (legenda). Opcional — sem ele, série única. */
  colorField?: string | null
  onColorFieldChange?: (value: string | null) => void
  display?: ChartDisplayOptions
  onDisplayChange?: (value: ChartDisplayOptions) => void
}

type SlotType = "dimension" | "metric" | "color"
type PanelTab = "data" | "labels" | "style"

const CARTESIAN_TYPES: VisualizationType[] = [
  "bar",
  "bar-horizontal",
  "line",
  "area",
  "scatter",
]

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

const controlClass =
  "h-9 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"

const labelClass = "mb-1.5 block text-xs font-medium text-muted-foreground"

export function VisualizationPanel({
  data,
  onBackToTable,
  chartType,
  onChartTypeChange,
  dimension,
  onDimensionChange,
  metric,
  onMetricChange,
  colorField = null,
  onColorFieldChange,
  display,
  onDisplayChange,
}: VisualizationPanelProps) {
  const columns = useMemo(() => analyzeColumns(data), [data])

  const [tab, setTab] = useState<PanelTab>("data")
  const [dragOverSlot, setDragOverSlot] = useState<SlotType | null>(null)
  const [dragError, setDragError] = useState<SlotType | null>(null)
  const dragErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const options = display ?? DEFAULT_DISPLAY_OPTIONS
  const patchOptions = useCallback(
    (patch: Partial<ChartDisplayOptions>) => {
      onDisplayChange?.({ ...options, ...patch })
    },
    [onDisplayChange, options]
  )

  const usedFields = useMemo(() => {
    const set = new Set<string>()
    if (dimension) set.add(dimension)
    if (metric) set.add(metric)
    if (colorField) set.add(colorField)
    return set
  }, [dimension, metric, colorField])

  const hasDimensionOptions = columns.some((c) =>
    chartType === "map" ? c.type === "numeric" : c.type === "categorical"
  )
  const hasMetricOptions = columns.some((c) => c.type === "numeric")
  const hasColorOptions = columns.some((c) => c.type === "categorical")

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

    if (slot === "color") {
      if (col.type === "categorical" && onColorFieldChange) onColorFieldChange(columnName)
      else showDragError(slot)
      return
    }

    if (chartType === "map" && col.type === "numeric") {
      if (slot === "dimension") onDimensionChange(columnName)
      else onMetricChange(columnName)
    } else if (slot === "dimension" && col.type === "categorical") {
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

    if (chartType === "map" && col.type === "numeric" && !dimension) {
      onDimensionChange(columnName)
    } else if (chartType === "map" && col.type === "numeric" && !metric) {
      onMetricChange(columnName)
    } else if (col.type === "categorical" && !dimension) {
      onDimensionChange(columnName)
    } else if (col.type === "numeric" && !metric) {
      onMetricChange(columnName)
    }
  }

  const showAxesLabels = CARTESIAN_TYPES.includes(chartType)
  const showSortLimit = chartType !== "kpi" && chartType !== "map"
  const showLegendControls =
    chartType !== "kpi" &&
    chartType !== "map" &&
    chartType !== "gauge" &&
    chartType !== "treemap"

  const tabs: Array<{ id: PanelTab; label: string }> = [
    { id: "data", label: "Dados" },
    { id: "labels", label: "Rótulos" },
    { id: "style", label: "Estilo" },
  ]

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Visualização</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
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
          <div className="rounded-lg border border-border bg-card self-start">
            <div className="border-b border-border px-3 py-2">
              <span className="text-xs font-medium text-muted-foreground">Campos</span>
            </div>
            <div className="max-h-[320px] space-y-1.5 overflow-y-auto p-2">
              {columns.length === 0 && (
                <p className="px-2 py-3 text-xs text-muted-foreground">
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
            {/* Tabs */}
            <div
              className="inline-flex rounded-lg border border-border bg-muted p-0.5"
              role="tablist"
              aria-label="Configuração da visualização"
            >
              {tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  onClick={() => setTab(item.id)}
                  className={
                    tab === item.id
                      ? "rounded-md bg-muted px-3 py-1.5 text-xs font-medium text-foreground"
                      : "rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  }
                >
                  {item.label}
                </button>
              ))}
            </div>

            {tab === "data" && (
              <div className="space-y-4" role="tabpanel" aria-label="Dados">
                {/* Chart type selector */}
                <div>
                  <label htmlFor="explorer-chart-type" className={labelClass}>
                    Tipo de gráfico
                  </label>
                  <select
                    id="explorer-chart-type"
                    aria-label="Tipo de gráfico"
                    className={controlClass}
                    value={chartType}
                    onChange={(event) =>
                      onChartTypeChange(event.target.value as VisualizationType)
                    }
                  >
                    {CHART_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {chartTypeLabel[type]}
                      </option>
                    ))}
                    <option value="kpi">KPI</option>
                  </select>
                </div>

                {/* Dimension slot */}
                {chartType !== "kpi" && (
                  <div>
                    <span className={labelClass}>
                      {chartType === "map" ? "Longitude" : "Dimensão"}
                    </span>
                    <FieldDropSlot
                      value={dimension}
                      label={chartType === "map" ? "Selecione longitude" : "Arraste um campo categórico aqui"}
                      dragOver={dragOverSlot === "dimension"}
                      error={dragError === "dimension"}
                      onDragOver={(e) => handleDragOver(e, "dimension")}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, "dimension")}
                      onRemove={() => onDimensionChange(null)}
                    />
                  </div>
                )}

                {/* Metric slot */}
                <div>
                  <span className={labelClass}>
                    {chartType === "kpi"
                      ? "Métrica do KPI"
                      : chartType === "map"
                        ? "Latitude"
                        : "Métrica"}
                  </span>
                  <FieldDropSlot
                    value={metric}
                    label={chartType === "map" ? "Selecione latitude" : "Arraste um campo numérico aqui"}
                    dragOver={dragOverSlot === "metric"}
                    error={dragError === "metric"}
                    onDragOver={(e) => handleDragOver(e, "metric")}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, "metric")}
                    onRemove={() => onMetricChange(null)}
                  />
                </div>

                {/* Series / color slot */}
                {chartType !== "kpi" && onColorFieldChange && (
                  <div>
                    <span className={labelClass}>Série (cor)</span>
                    <FieldDropSlot
                      value={colorField}
                      label="Agrupa por um campo categórico"
                      dragOver={dragOverSlot === "color"}
                      error={dragError === "color"}
                      onDragOver={(e) => handleDragOver(e, "color")}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, "color")}
                      onRemove={() => onColorFieldChange(null)}
                    />
                    {!hasColorOptions && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Nenhum campo categórico para agrupar.
                      </p>
                    )}
                  </div>
                )}

                {/* Sort + limit */}
                {showSortLimit && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="explorer-sort-field" className={labelClass}>
                        Ordenar por
                      </label>
                      <select
                        id="explorer-sort-field"
                        className={controlClass}
                        value={options.sortField ?? ""}
                        onChange={(event) =>
                          patchOptions({ sortField: event.target.value || null })
                        }
                      >
                        <option value="">Sem ordenação</option>
                        {dimension && <option value={dimension}>Dimensão</option>}
                        {metric && <option value={metric}>Métrica</option>}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="explorer-sort-dir" className={labelClass}>
                        Direção
                      </label>
                      <select
                        id="explorer-sort-dir"
                        className={controlClass}
                        value={options.sortDirection}
                        onChange={(event) =>
                          patchOptions({
                            sortDirection: event.target.value as "asc" | "desc",
                          })
                        }
                      >
                        <option value="desc">Maior primeiro</option>
                        <option value="asc">Menor primeiro</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor="explorer-limit" className={labelClass}>
                        Limite de itens (Top N)
                      </label>
                      <input
                        id="explorer-limit"
                        type="number"
                        min={1}
                        placeholder="Todos"
                        className={controlClass}
                        value={options.limit ?? ""}
                        onChange={(event) => {
                          const raw = event.target.value
                          const parsed = Number(raw)
                          patchOptions({
                            limit:
                              raw !== "" && Number.isFinite(parsed) && parsed >= 1
                                ? Math.floor(parsed)
                                : null,
                          })
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Validation messages */}
                <div className="space-y-1">
                  {chartType !== "kpi" && !hasDimensionOptions && (
                    <p className="text-sm text-warning">
                      {chartType === "map"
                        ? "Nenhum campo numérico disponível para longitude"
                        : "Nenhum campo categórico para dimensão"}
                    </p>
                  )}
                  {!hasMetricOptions && (
                    <p className="text-sm text-warning">
                      Nenhum campo numérico para métrica
                    </p>
                  )}
                  {hasDimensionOptions &&
                    hasMetricOptions &&
                    dimension &&
                    metric &&
                    !hasValidMetricData && (
                      <p className="text-sm text-muted-foreground">
                        Nenhum dado válido para visualizar
                      </p>
                    )}
                </div>
              </div>
            )}

            {tab === "labels" && (
              <div className="space-y-4" role="tabpanel" aria-label="Rótulos">
                <div>
                  <label htmlFor="explorer-title" className={labelClass}>
                    Título do gráfico
                  </label>
                  <input
                    id="explorer-title"
                    type="text"
                    placeholder="Ex.: Atendimentos por município"
                    className={controlClass}
                    value={options.title}
                    onChange={(event) => patchOptions({ title: event.target.value })}
                  />
                </div>

                {showAxesLabels && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="explorer-x-label" className={labelClass}>
                        Rótulo do eixo horizontal
                      </label>
                      <input
                        id="explorer-x-label"
                        type="text"
                        placeholder="Ex.: Município"
                        className={controlClass}
                        value={options.xAxisLabel}
                        onChange={(event) =>
                          patchOptions({ xAxisLabel: event.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label htmlFor="explorer-y-label" className={labelClass}>
                        Rótulo do eixo vertical
                      </label>
                      <input
                        id="explorer-y-label"
                        type="text"
                        placeholder="Ex.: Total de atendimentos"
                        className={controlClass}
                        value={options.yAxisLabel}
                        onChange={(event) =>
                          patchOptions({ yAxisLabel: event.target.value })
                        }
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="explorer-number-format" className={labelClass}>
                    Formatação dos números
                  </label>
                  <select
                    id="explorer-number-format"
                    className={controlClass}
                    value={options.numberFormat}
                    onChange={(event) =>
                      patchOptions({
                        numberFormat: event.target.value as ChartNumberFormat,
                      })
                    }
                  >
                    <option value="number">Número (1.234,56)</option>
                    <option value="currency">Moeda (R$ 1.234,56)</option>
                    <option value="percent">Percentual (12,3%)</option>
                    <option value="compact">Abreviado (1,2 mil)</option>
                  </select>
                </div>

                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border accent-primary"
                    checked={options.showValues}
                    onChange={(event) =>
                      patchOptions({ showValues: event.target.checked })
                    }
                  />
                  Mostrar valor em cada item
                </label>

                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border accent-primary"
                    checked={options.exportable}
                    onChange={(event) =>
                      patchOptions({ exportable: event.target.checked })
                    }
                  />
                  Botão para baixar imagem (PNG)
                </label>
              </div>
            )}

            {tab === "style" && (
              <div className="space-y-4" role="tabpanel" aria-label="Estilo">
                {showLegendControls && (
                  <>
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border accent-primary"
                        checked={options.legend}
                        onChange={(event) =>
                          patchOptions({ legend: event.target.checked })
                        }
                      />
                      Exibir legenda
                    </label>

                    {options.legend && (
                      <div>
                        <label htmlFor="explorer-legend-pos" className={labelClass}>
                          Posição da legenda
                        </label>
                        <select
                          id="explorer-legend-pos"
                          className={controlClass}
                          value={options.legendPosition}
                          onChange={(event) =>
                            patchOptions({
                              legendPosition:
                                event.target.value as ChartLegendPosition,
                            })
                          }
                        >
                          <option value="bottom">Abaixo</option>
                          <option value="top">Acima</option>
                          <option value="left">Esquerda</option>
                          <option value="right">Direita</option>
                        </select>
                      </div>
                    )}
                  </>
                )}

                <div>
                  <label htmlFor="explorer-palette" className={labelClass}>
                    Paleta de cores
                  </label>
                  <select
                    id="explorer-palette"
                    className={controlClass}
                    value={options.colors ? "custom" : options.palette}
                    onChange={(event) => {
                      const id = event.target.value
                      if (id === "custom") return
                      patchOptions({
                        palette: id,
                        colors: PALETTES.find((preset) => preset.id === id)?.colors ?? null,
                      })
                    }}
                  >
                    {PALETTES.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.label}
                      </option>
                    ))}
                    {options.colors && <option value="custom">Personalizada</option>}
                  </select>
                  <div className="mt-2 flex gap-1.5" aria-hidden="true">
                    {(options.colors ??
                      PALETTES.find(
                        (preset) => preset.id === (options.colors ? "custom" : options.palette)
                      )?.colors ?? [
                      "#5470c6",
                      "#91cc75",
                      "#fac858",
                      "#ee6666",
                      "#73c0de",
                      "#3ba272",
                    ]).map((color) => (
                      <span
                        key={color}
                        className="h-4 w-4 rounded-sm border border-black/10"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                {(chartType === "bar" ||
                  chartType === "line" ||
                  chartType === "area") && (
                  <>
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border accent-primary"
                        checked={options.stacked}
                        onChange={(event) =>
                          patchOptions({ stacked: event.target.checked })
                        }
                      />
                      Empilhar séries
                    </label>
                    {(chartType === "line" || chartType === "area") && (
                      <label className="flex items-center gap-2 text-sm text-foreground">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-border accent-primary"
                          checked={options.smooth}
                          onChange={(event) =>
                            patchOptions({ smooth: event.target.checked })
                          }
                        />
                        Linha suave
                      </label>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Chart */}
        <div className="h-[400px] rounded-lg border border-border bg-muted/50/50 p-3">
          <PreviewChart
            data={data}
            chartType={chartType}
            dimension={dimension}
            metric={metric}
            colorField={colorField}
            display={options}
          />
        </div>
      </CardContent>
    </Card>
  )
}
