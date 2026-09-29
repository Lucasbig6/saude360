export type ChartType =
  | "bar"
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

export interface ChartConfig {
  type: ChartType
  encoding?: ChartEncoding
  aggregation?: ChartAggregation
  sort?: ChartSort
  limit?: number
  legend?: boolean
  tooltip?: boolean
  title?: string
  options?: Record<string, unknown>
}

export interface LegacyAnalysisLike {
  chartType?: string | null
  dimension?: string | null
  metric?: string | null
}

export const CHART_TYPES: ChartType[] = [
  "bar",
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
]

export const WIDGET_TYPES: WidgetType[] = [
  ...CHART_TYPES,
  "table",
  "kpi",
  "text",
  "image",
]

const AGGREGATION_FUNCTIONS: AggregationFunction[] = ["sum", "avg", "count", "min", "max"]

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
  if (raw.options && typeof raw.options === "object" && !Array.isArray(raw.options)) {
    config.options = { ...(raw.options as Record<string, unknown>) }
  }

  return config
}

export function legacyToChartConfig(analysis: LegacyAnalysisLike): ChartConfig | null {
  if (analysis.chartType === "table") {
    return null
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
