import {
  isChartType,
  legacyToChartConfig,
  normalizeChartConfig,
  type AggregationFunction,
  type ChartConfig,
  type LegacyAnalysisLike,
} from "@/lib/charts/chart-config"

export interface TableConfig {
  type: "table"
  title?: string
  limit?: number
}

export interface KpiConfig {
  type: "kpi"
  title?: string
  field?: string
  function?: AggregationFunction
}

export interface TextConfig {
  type: "text"
  title?: string
  content: string
}

export interface ImageConfig {
  type: "image"
  title?: string
  src: string
  alt?: string
}

export type StaticWidgetType = "table" | "kpi" | "text" | "image"

export type WidgetConfig =
  | ChartConfig
  | TableConfig
  | KpiConfig
  | TextConfig
  | ImageConfig

export const STATIC_WIDGET_TYPES: StaticWidgetType[] = [
  "table",
  "kpi",
  "text",
  "image",
]

export function isStaticWidgetType(value: unknown): value is StaticWidgetType {
  return (
    typeof value === "string" && (STATIC_WIDGET_TYPES as string[]).includes(value)
  )
}

export function isChartWidgetConfig(
  config: WidgetConfig
): config is ChartConfig {
  return isChartType(config.type)
}

function positiveInt(value: unknown): number | undefined {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined
  return Math.floor(parsed)
}

function normalizeStaticConfig(raw: Record<string, unknown>): WidgetConfig {
  const title = typeof raw.title === "string" && raw.title ? raw.title : undefined

  switch (raw.type) {
    case "table": {
      const config: TableConfig = { type: "table" }
      if (title) config.title = title
      const limit = positiveInt(raw.limit)
      if (limit !== undefined) config.limit = limit
      return config
    }
    case "kpi": {
      const config: KpiConfig = { type: "kpi" }
      if (title) config.title = title
      if (typeof raw.field === "string" && raw.field) config.field = raw.field
      if (typeof raw.function === "string" && raw.function) {
        config.function = raw.function as AggregationFunction
      }
      return config
    }
    case "text": {
      const config: TextConfig = {
        type: "text",
        content: typeof raw.content === "string" ? raw.content : "",
      }
      if (title) config.title = title
      return config
    }
    case "image": {
      const config: ImageConfig = {
        type: "image",
        src: typeof raw.src === "string" ? raw.src : "",
      }
      if (title) config.title = title
      if (typeof raw.alt === "string" && raw.alt) config.alt = raw.alt
      return config
    }
    default:
      throw new Error(`tipo de widget desconhecido: ${String(raw.type)}`)
  }
}

export function normalizeWidgetConfig(input: unknown): WidgetConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("WidgetConfig inválida")
  }
  const raw = input as Record<string, unknown>
  if (isChartType(raw.type)) {
    return normalizeChartConfig(raw)
  }
  if (isStaticWidgetType(raw.type)) {
    return normalizeStaticConfig(raw)
  }
  throw new Error(`tipo de widget desconhecido: ${String(raw.type)}`)
}

/**
 * Config v2 para uma análise legada (espelha o backend): tabela vira
 * `table`, tipo de gráfico conhecido é mantido, o resto vira `bar`.
 */
export function legacyToWidgetConfig(analysis: LegacyAnalysisLike): WidgetConfig {
  if (analysis.chartType === "table") {
    return { type: "table" }
  }
  if (analysis.chartType === "kpi") {
    return {
      type: "kpi",
      field: analysis.metric ?? undefined,
      function: analysis.metric ? "sum" : "count",
    }
  }
  return legacyToChartConfig(analysis) ?? { type: "table" }
}

export function kpiValue(
  rows: Record<string, unknown>[],
  config: KpiConfig
): number | null {
  const fn = config.function ?? "sum"
  if (fn === "count" || !config.field) {
    return rows.length
  }

  const values: number[] = []
  for (const row of rows) {
    const raw = row[config.field]
    const parsed =
      typeof raw === "number"
        ? raw
        : typeof raw === "string" && raw.trim() !== ""
          ? Number(raw)
          : NaN
    if (Number.isFinite(parsed)) {
      values.push(parsed)
    }
  }

  if (values.length === 0) {
    return null
  }

  switch (fn) {
    case "sum":
      return values.reduce((total, value) => total + value, 0)
    case "avg":
      return values.reduce((total, value) => total + value, 0) / values.length
    case "min":
      return Math.min(...values)
    case "max":
      return Math.max(...values)
    default:
      return null
  }
}
