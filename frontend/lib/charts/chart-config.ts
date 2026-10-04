export type ChartType =
  | "bar"
  | "bar-horizontal"
  | "line"
  | "area"
  | "pie"
  | "donut"
  | "scatter"
  | "radar"
  | "gauge"
  | "funnel"
  | "heatmap"
  | "treemap"
  | "map"

export type WidgetType = ChartType | "table" | "kpi" | "text" | "image"

export type AggregationFunction = "sum" | "avg" | "count" | "min" | "max"

export interface ChartEncoding {
  x?: string
  y?: string
  color?: string
  size?: string
  series?: string
}

export interface ChartAggregation {
  field: string
  function: AggregationFunction
}

export interface ChartSort {
  field: string
  direction: "asc" | "desc"
}

export type ChartNumberFormat = "number" | "currency" | "percent" | "compact"

export type ChartLegendPosition = "top" | "bottom" | "left" | "right"

export interface ChartConfig {
  type: ChartType
  encoding?: ChartEncoding
  aggregation?: ChartAggregation
  sort?: ChartSort
  limit?: number
  legend?: boolean
  tooltip?: boolean
  title?: string
  /** Rótulo do eixo de dimensão (X nas barras verticais). */
  xAxisLabel?: string
  /** Rótulo do eixo de valor (Y nas barras verticais). */
  yAxisLabel?: string
  numberFormat?: ChartNumberFormat
  /** Exibe o valor ao lado de cada barra/ponto/fatia (data labels). */
  showValues?: boolean
  /** Posição da legenda quando ela aparece. */
  legendPosition?: ChartLegendPosition
  /** Paleta de cores aplicada às séries (vazia = paleta padrão do ECharts). */
  colors?: string[]
  /** Barras/áreas empilhadas por categoria. */
  stacked?: boolean
  /** Linhas suaves (só line/area). */
  smooth?: boolean
  /** Habilita o toolbox com "salvar imagem" no canto do gráfico. */
  exportable?: boolean
  options?: Record<string, unknown>
}

export interface LegacyAnalysisLike {
  chartType?: string | null
  dimension?: string | null
  metric?: string | null
  /** Config completa de apresentação (quando a análise já foi salva com ela). */
  chartConfig?: ChartConfig | null
}

export const CHART_TYPES: ChartType[] = [
  "bar",
  "bar-horizontal",
  "line",
  "area",
  "pie",
  "donut",
  "scatter",
  "radar",
  "gauge",
  "funnel",
  "heatmap",
  "treemap",
  "map",
]

export const WIDGET_TYPES: WidgetType[] = [
  ...CHART_TYPES,
  "table",
  "kpi",
  "text",
  "image",
]

const AGGREGATION_FUNCTIONS: AggregationFunction[] = ["sum", "avg", "count", "min", "max"]

const NUMBER_FORMATS: ChartNumberFormat[] = ["number", "currency", "percent", "compact"]

const LEGEND_POSITIONS: ChartLegendPosition[] = ["top", "bottom", "left", "right"]

export function isChartNumberFormat(value: unknown): value is ChartNumberFormat {
  return typeof value === "string" && (NUMBER_FORMATS as string[]).includes(value)
}

export function isChartLegendPosition(value: unknown): value is ChartLegendPosition {
  return typeof value === "string" && (LEGEND_POSITIONS as string[]).includes(value)
}

export function isChartType(value: unknown): value is ChartType {
  return typeof value === "string" && (CHART_TYPES as string[]).includes(value)
}

export function isWidgetType(value: unknown): value is WidgetType {
  return typeof value === "string" && (WIDGET_TYPES as string[]).includes(value)
}

export function isAggregationFunction(value: unknown): value is AggregationFunction {
  return typeof value === "string" && AGGREGATION_FUNCTIONS.includes(value as AggregationFunction)
}

export function defaultChartConfig(type: ChartType): ChartConfig {
  return {
    type,
    legend: true,
    tooltip: true,
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} inválido`)
  }
  return value
}

export function normalizeChartConfig(input: unknown): ChartConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("ChartConfig inválida")
  }

  const raw = input as Record<string, unknown>

  if (!isChartType(raw.type)) {
    throw new Error(`tipo de gráfico desconhecido: ${String(raw.type)}`)
  }

  const config = defaultChartConfig(raw.type)

  if (raw.encoding && typeof raw.encoding === "object" && !Array.isArray(raw.encoding)) {
    const source = raw.encoding as Record<string, unknown>
    const encoding: ChartEncoding = {}
    for (const key of ["x", "y", "color", "size", "series"] as const) {
      const value = source[key]
      if (typeof value === "string" && value.trim() !== "") {
        encoding[key] = value
      }
    }
    if (Object.keys(encoding).length > 0) {
      config.encoding = encoding
    }
  }

  if (raw.aggregation !== undefined && raw.aggregation !== null) {
    if (typeof raw.aggregation !== "object" || Array.isArray(raw.aggregation)) {
      throw new Error("aggregation inválida")
    }
    const source = raw.aggregation as Record<string, unknown>
    const field = requireString(source.field, "aggregation.field")
    if (!isAggregationFunction(source.function)) {
      throw new Error(`aggregation.function inválido: ${String(source.function)}`)
    }
    config.aggregation = { field, function: source.function }
  }

  if (raw.sort !== undefined && raw.sort !== null) {
    if (typeof raw.sort !== "object" || Array.isArray(raw.sort)) {
      throw new Error("sort inválido")
    }
    const source = raw.sort as Record<string, unknown>
    const field = requireString(source.field, "sort.field")
    if (source.direction !== "asc" && source.direction !== "desc") {
      throw new Error(`sort.direction inválido: ${String(source.direction)}`)
    }
    config.sort = { field, direction: source.direction }
  }

  if (raw.limit !== undefined && raw.limit !== null) {
    const limit = Number(raw.limit)
    if (!Number.isFinite(limit) || limit <= 0) {
      throw new Error(`limit inválido: ${String(raw.limit)}`)
    }
    config.limit = Math.floor(limit)
  }

  if (typeof raw.legend === "boolean") {
    config.legend = raw.legend
  }
  if (typeof raw.tooltip === "boolean") {
    config.tooltip = raw.tooltip
  }
  if (typeof raw.title === "string") {
    config.title = raw.title
  }
  if (typeof raw.xAxisLabel === "string") {
    config.xAxisLabel = raw.xAxisLabel
  }
  if (typeof raw.yAxisLabel === "string") {
    config.yAxisLabel = raw.yAxisLabel
  }
  if (isChartNumberFormat(raw.numberFormat)) {
    config.numberFormat = raw.numberFormat
  }
  if (typeof raw.showValues === "boolean") {
    config.showValues = raw.showValues
  }
  if (isChartLegendPosition(raw.legendPosition)) {
    config.legendPosition = raw.legendPosition
  }
  if (Array.isArray(raw.colors)) {
    const colors = raw.colors.filter(
      (color): color is string => typeof color === "string" && color.trim() !== ""
    )
    if (colors.length > 0) {
      config.colors = colors
    }
  }
  if (typeof raw.stacked === "boolean") {
    config.stacked = raw.stacked
  }
  if (typeof raw.smooth === "boolean") {
    config.smooth = raw.smooth
  }
  if (typeof raw.exportable === "boolean") {
    config.exportable = raw.exportable
  }
  if (raw.options && typeof raw.options === "object" && !Array.isArray(raw.options)) {
    config.options = { ...(raw.options as Record<string, unknown>) }
  }

  return config
}

export function legacyToChartConfig(analysis: LegacyAnalysisLike): ChartConfig | null {
  if (analysis.chartType === "table") {
    return null
  }

  // Análise já salva com a config completa (rótulos, cores, ordenação...):
  // usa ela diretamente — os campos legados abaixo servem de fallback.
  if (analysis.chartConfig && isChartType(analysis.chartConfig.type)) {
    return analysis.chartConfig
  }

  const type: ChartType = isChartType(analysis.chartType) ? analysis.chartType : "bar"
  const config = defaultChartConfig(type)
  const encoding: ChartEncoding = {}

  if (analysis.dimension) {
    encoding.x = analysis.dimension
  }
  if (analysis.metric) {
    encoding.y = analysis.metric
  }
  if (Object.keys(encoding).length > 0) {
    config.encoding = encoding
  }

  return config
}
