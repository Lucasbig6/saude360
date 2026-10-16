import {
  isChartType,
  legacyToChartConfig,
  normalizeChartConfig,
  type AggregationFunction,
  type ChartConfig,
  type LegacyAnalysisLike,
} from "@/lib/charts/chart-config"

export interface WidgetStyle {
  backgroundColor?: string
  borderColor?: string
  borderWidth?: number
  borderRadius?: number
  shadow?: "none" | "sm" | "md"
  opacity?: number
  visible?: boolean
  zIndex?: number
}

export const FONT_FAMILIES = ["Inter", "Arial", "Georgia", "monospace"] as const

export type FontFamily = (typeof FONT_FAMILIES)[number]

interface PresentationalWidget {
  style?: WidgetStyle
}

export function isFontFamily(value: unknown): value is FontFamily {
  return (
    typeof value === "string" &&
    (FONT_FAMILIES as readonly string[]).includes(value)
  )
}

const OBJECT_POSITION_PATTERN =
  /^(?:center|top|bottom|left|right)(?: (?:center|top|bottom|left|right))?$|^\d{1,3}% \d{1,3}%$/

export function isObjectPosition(value: unknown): value is string {
  return typeof value === "string" && OBJECT_POSITION_PATTERN.test(value)
}

export const MAX_CUSTOM_HTML_CHARS = 20_000

const FORBIDDEN_HTML_PATTERN =
  /<\s*(script|iframe|object|embed|form|input|button)\b|on\w+\s*=|javascript\s*:|data\s*:\s*text\/html/i

const FORBIDDEN_CSS_PATTERN = /javascript\s*:|expression\s*\(|url\s*\(\s*data:/i

export interface CustomHtmlConfig extends PresentationalWidget {
  type: "custom-html"
  title?: string
  html: string
  css?: string
}

export interface TableConfig extends PresentationalWidget {
  type: "table"
  title?: string
  limit?: number
}

export interface KpiConfig extends PresentationalWidget {
  type: "kpi"
  title?: string
  field?: string
  function?: AggregationFunction
}

export interface TextConfig extends PresentationalWidget {
  type: "text"
  title?: string
  content: string
  fontFamily?: FontFamily
  fontSize?: number
  fontWeight?: 400 | 500 | 600 | 700
  color?: string
  alignment?: "left" | "center" | "right"
}

export interface ImageConfig extends PresentationalWidget {
  type: "image"
  title?: string
  src: string
  alt?: string
  fit?: "contain" | "cover" | "fill"
  objectPosition?: string
  aspectRatio?: string
}

export interface ShapeConfig extends PresentationalWidget {
  type: "shape"
  title?: string
  shape: "rectangle" | "circle" | "line" | "divider"
  fill?: string
  stroke?: string
  strokeWidth?: number
}

export interface FilterWidgetConfig extends PresentationalWidget {
  type: "filter"
  title?: string
  filterId: string
}

export type StaticWidgetType = "table" | "kpi" | "text" | "image" | "shape"

export type WidgetConfig =
  | (ChartConfig & PresentationalWidget)
  | TableConfig
  | KpiConfig
  | TextConfig
  | ImageConfig
  | ShapeConfig
  | FilterWidgetConfig
  | CustomHtmlConfig

export const STATIC_WIDGET_TYPES: StaticWidgetType[] = [
  "table",
  "kpi",
  "text",
  "image",
  "shape",
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

function isSafeColor(value: unknown): value is string {
  return typeof value === "string" && /^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(value)
}

function normalizeWidgetStyle(value: unknown): WidgetStyle | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const raw = value as Record<string, unknown>
  const style: WidgetStyle = {}
  if (isSafeColor(raw.backgroundColor)) style.backgroundColor = raw.backgroundColor
  if (isSafeColor(raw.borderColor)) style.borderColor = raw.borderColor
  if (typeof raw.borderWidth === "number") style.borderWidth = Math.max(0, Math.min(16, raw.borderWidth))
  if (typeof raw.borderRadius === "number") style.borderRadius = Math.max(0, Math.min(32, raw.borderRadius))
  if (raw.shadow === "none" || raw.shadow === "sm" || raw.shadow === "md") style.shadow = raw.shadow
  if (typeof raw.opacity === "number") style.opacity = Math.max(0, Math.min(1, raw.opacity))
  if (typeof raw.visible === "boolean") style.visible = raw.visible
  if (typeof raw.zIndex === "number") style.zIndex = Math.max(0, Math.min(1000, Math.round(raw.zIndex)))
  return Object.keys(style).length > 0 ? style : undefined
}

function normalizeStaticConfig(raw: Record<string, unknown>): WidgetConfig {
  const title = typeof raw.title === "string" && raw.title ? raw.title : undefined
  const style = normalizeWidgetStyle(raw.style)
  const withStyle = <T extends object>(config: T): T & PresentationalWidget =>
    style ? { ...config, style } : config

  switch (raw.type) {
    case "table": {
      const config: TableConfig = { type: "table" }
      if (title) config.title = title
      const limit = positiveInt(raw.limit)
      if (limit !== undefined) config.limit = limit
      return withStyle(config)
    }
    case "kpi": {
      const config: KpiConfig = { type: "kpi" }
      if (title) config.title = title
      if (typeof raw.field === "string" && raw.field) config.field = raw.field
      if (typeof raw.function === "string" && raw.function) {
        config.function = raw.function as AggregationFunction
      }
      return withStyle(config)
    }
    case "text": {
      const config: TextConfig = {
        type: "text",
        content: typeof raw.content === "string" ? raw.content : "",
      }
      if (title) config.title = title
      if (isFontFamily(raw.fontFamily)) config.fontFamily = raw.fontFamily
      if (typeof raw.fontSize === "number") {
        config.fontSize = Math.max(10, Math.min(72, Math.round(raw.fontSize)))
      }
      if ([400, 500, 600, 700].includes(Number(raw.fontWeight))) {
        config.fontWeight = Number(raw.fontWeight) as TextConfig["fontWeight"]
      }
      if (isSafeColor(raw.color)) config.color = raw.color
      if (raw.alignment === "left" || raw.alignment === "center" || raw.alignment === "right") {
        config.alignment = raw.alignment
      }
      return withStyle(config)
    }
    case "image": {
      const config: ImageConfig = {
        type: "image",
        src: typeof raw.src === "string" ? raw.src : "",
      }
      if (title) config.title = title
      if (typeof raw.alt === "string" && raw.alt) config.alt = raw.alt
      if (raw.fit === "contain" || raw.fit === "cover" || raw.fit === "fill") {
        config.fit = raw.fit
      }
      if (isObjectPosition(raw.objectPosition)) {
        config.objectPosition = raw.objectPosition
      }
      if (typeof raw.aspectRatio === "string" && /^\d+(?:\/\d+|:\d+)?$/.test(raw.aspectRatio)) {
        config.aspectRatio = raw.aspectRatio
      }
      return withStyle(config)
    }
    case "shape": {
      const shape = ["rectangle", "circle", "line", "divider"].includes(String(raw.shape))
        ? (raw.shape as ShapeConfig["shape"])
        : "rectangle"
      const config: ShapeConfig = { type: "shape", shape }
      if (title) config.title = title
      if (isSafeColor(raw.fill)) config.fill = raw.fill
      if (isSafeColor(raw.stroke)) config.stroke = raw.stroke
      if (typeof raw.strokeWidth === "number") {
        config.strokeWidth = Math.max(0, Math.min(24, Math.round(raw.strokeWidth)))
      }
      return withStyle(config)
    }
    default:
      throw new Error(`tipo de widget desconhecido: ${String(raw.type)}`)
  }
}

function normalizeCustomHtmlConfig(raw: Record<string, unknown>): CustomHtmlConfig {
  const title = typeof raw.title === "string" && raw.title ? raw.title : undefined
  const style = normalizeWidgetStyle(raw.style)
  const html = typeof raw.html === "string" ? raw.html : ""
  const css = typeof raw.css === "string" ? raw.css : undefined
  if (html.length > MAX_CUSTOM_HTML_CHARS) {
    throw new Error("conteúdo personalizado excede o limite de tamanho")
  }
  if (css !== undefined && css.length > MAX_CUSTOM_HTML_CHARS) {
    throw new Error("conteúdo personalizado excede o limite de tamanho")
  }
  if (FORBIDDEN_HTML_PATTERN.test(html)) {
    throw new Error("conteúdo personalizado inválido")
  }
  if (css !== undefined && FORBIDDEN_CSS_PATTERN.test(css)) {
    throw new Error("conteúdo personalizado inválido")
  }
  const config: CustomHtmlConfig = { type: "custom-html", html }
  if (title) config.title = title
  if (css) config.css = css
  return style ? { ...config, style } : config
}

export function normalizeWidgetConfig(input: unknown): WidgetConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("WidgetConfig inválida")
  }
  const raw = input as Record<string, unknown>
  if (isChartType(raw.type)) {
    const config = normalizeChartConfig(raw)
    const style = normalizeWidgetStyle(raw.style)
    return style ? { ...config, style } : config
  }
  if (raw.type === "filter") {
    if (typeof raw.filterId !== "string" || !raw.filterId) {
      throw new Error("filterId inválido")
    }
    const style = normalizeWidgetStyle(raw.style)
    return style
      ? { type: "filter", filterId: raw.filterId, style }
      : { type: "filter", filterId: raw.filterId }
  }
  if (raw.type === "custom-html") {
    return normalizeCustomHtmlConfig(raw)
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
