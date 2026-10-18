import type { DashboardWidget } from "@/lib/types/dashboard"
import type {
  CustomHtmlConfig,
  FilterWidgetConfig,
  ImageConfig,
  ShapeConfig,
  TextConfig,
  WidgetConfig,
  WidgetStyle,
} from "@/lib/types/widgets"

/**
 * Gerador de IDs injetável.
 *
 * Produção usa `crypto.randomUUID()` (via `defaultElementId`). Testes devem
 * injetar `createTestIdGenerator()` — um contador isolado por chamada — em
 * vez de depender de qualquer fallback global compartilhado.
 */
export type ElementIdGenerator = () => string

export const MAX_Z_INDEX = 1000

const GRID_COLUMNS = 12

export function defaultElementId(): string {
  const randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto)
  if (randomUUID) return randomUUID()
  return `element-${Date.now().toString(36)}-${Math.floor(
    Math.random() * 1_000_000
  ).toString(36)}`
}

/** Contador isolado por ambiente de teste — nunca usado em produção. */
export function createTestIdGenerator(
  prefix = "test-widget"
): ElementIdGenerator {
  let count = 0
  return () => `${prefix}-${++count}`
}

function cloneConfig<T extends WidgetConfig>(config: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(config)
  }
  return JSON.parse(JSON.stringify(config)) as T
}

export type TextElementKind = "body" | "heading" | "subtitle"

const TEXT_DEFAULTS: Record<TextElementKind, TextConfig> = {
  body: { type: "text", title: "Texto", content: "Adicione seu texto" },
  heading: {
    type: "text",
    title: "Título",
    content: "Título do painel",
    fontSize: 28,
    fontWeight: 700,
  },
  subtitle: {
    type: "text",
    title: "Subtítulo",
    content: "Subtítulo",
    fontSize: 18,
    fontWeight: 500,
  },
}

export function createTextElement(
  kind: TextElementKind = "body",
  overrides?: Partial<TextConfig>
): TextConfig {
  return { ...TEXT_DEFAULTS[kind], ...overrides, type: "text" }
}

export function createShapeElement(
  shape: ShapeConfig["shape"] = "rectangle",
  overrides?: Partial<ShapeConfig>
): ShapeConfig {
  const defaults: Record<ShapeConfig["shape"], ShapeConfig> = {
    rectangle: {
      type: "shape",
      shape: "rectangle",
      fill: "#f1f5f9",
      stroke: "#cbd5e1",
    },
    circle: {
      type: "shape",
      shape: "circle",
      fill: "#dbeafe",
      stroke: "#60a5fa",
    },
    line: { type: "shape", shape: "line", stroke: "#64748b", strokeWidth: 2 },
    divider: { type: "shape", shape: "divider", stroke: "#cbd5e1" },
  }
  return { ...defaults[shape], ...overrides, type: "shape", shape }
}

export function createImageElement(
  src: string,
  options?: { title?: string; alt?: string }
): ImageConfig {
  if (!src) throw new Error("src da imagem é obrigatório")
  return {
    type: "image",
    src,
    title: options?.title,
    alt: options?.alt,
    fit: "contain",
  }
}

export function createFilterWidgetConfig(
  filterId: string,
  title?: string
): FilterWidgetConfig {
  if (!filterId) throw new Error("filterId inválido")
  return title
    ? { type: "filter", filterId, title }
    : { type: "filter", filterId }
}

export function createCustomHtmlElement(
  overrides?: Partial<CustomHtmlConfig>
): CustomHtmlConfig {
  return { type: "custom-html", html: "", ...overrides, title: overrides?.title }
}

export interface DuplicateOptions {
  generateId?: ElementIdGenerator
  /** Colunas do grid para clampar o deslocamento horizontal. */
  columns?: number
}

/**
 * Duplica um widget com novo ID estável e clone profundo da config.
 * A cópia é posicionada na primeira linha livre (`y: Infinity`, resolvido
 * pelo payload) com deslocamento horizontal de +1 para não sobrepor.
 * Widgets `filter` mantêm a referência ao mesmo filtro (duplica o cartão,
 * não o filtro).
 */
export function duplicateWidget(
  widget: DashboardWidget,
  options?: DuplicateOptions
): DashboardWidget {
  const generateId = options?.generateId ?? defaultElementId
  const columns = options?.columns ?? GRID_COLUMNS
  const config = widget.config ? cloneConfig(widget.config) : undefined
  return {
    ...widget,
    id: generateId(),
    ...(config ? { config } : {}),
    layout: {
      ...widget.layout,
      x: Math.min(
        Math.max(0, widget.layout.x + 1),
        Math.max(0, columns - widget.layout.w)
      ),
      // Infinito = "anexar abaixo" (resolvido antes da persistência).
      y: Number.POSITIVE_INFINITY,
    },
  }
}

export interface CopiedWidgetPayload {
  config?: WidgetConfig
  analysisId: string | null
}

export function copyWidgetPayload(widget: DashboardWidget): CopiedWidgetPayload {
  return {
    ...(widget.config ? { config: cloneConfig(widget.config) } : {}),
    analysisId: widget.analysisId,
  }
}

export function pasteWidgetPayload(
  payload: CopiedWidgetPayload,
  targetPageId: string | null,
  options?: DuplicateOptions & {
    layout?: Partial<DashboardWidget["layout"]>
  }
): DashboardWidget {
  const generateId = options?.generateId ?? defaultElementId
  const columns = options?.columns ?? GRID_COLUMNS
  const w = options?.layout?.w ?? 4
  const x = Math.min(
    Math.max(0, options?.layout?.x ?? 0),
    Math.max(0, columns - w)
  )
  return {
    id: generateId(),
    analysisId: payload.analysisId,
    ...(payload.config ? { config: cloneConfig(payload.config) } : {}),
    layout: {
      x,
      y: options?.layout?.y ?? Number.POSITIVE_INFINITY,
      w,
      h: options?.layout?.h ?? 3,
    },
    pageId: targetPageId,
  }
}

/**
 * Atalhos do editor devem ser ignorados quando o foco está em campos
 * editáveis ou diálogos — evita sequestrar digitação e atalhos do navegador.
 */
export function isEditorShortcutTargetIgnored(
  target: EventTarget | null
): boolean {
  if (!target) return false
  const el = target as Partial<HTMLElement>
  if (typeof el.closest !== "function") return false
  return (
    el.closest(
      'input, textarea, select, [contenteditable="true"], [role="dialog"], dialog'
    ) !== null
  )
}

/** Maior zIndex em uso + 1, limitado a MAX_Z_INDEX. */
export function nextZIndex(widgets: DashboardWidget[]): number {
  let max = 0
  for (const widget of widgets) {
    const z = widget.config?.style?.zIndex
    if (typeof z === "number" && Number.isFinite(z)) max = Math.max(max, z)
  }
  return Math.min(MAX_Z_INDEX, Math.floor(max) + 1)
}

export function withWidgetStyle(
  widget: DashboardWidget,
  patch: Partial<WidgetStyle>
): DashboardWidget {
  if (!widget.config) return widget
  return {
    ...widget,
    config: { ...widget.config, style: { ...widget.config.style, ...patch } },
  }
}

export function bringToFront(
  widgets: DashboardWidget[],
  widgetId: string
): DashboardWidget[] {
  const target = widgets.find((w) => w.id === widgetId)
  if (!target?.config) return widgets
  const zIndex = nextZIndex(widgets)
  return widgets.map((w) => (w.id === widgetId ? withWidgetStyle(w, { zIndex }) : w))
}

export function sendToBack(
  widgets: DashboardWidget[],
  widgetId: string
): DashboardWidget[] {
  const target = widgets.find((w) => w.id === widgetId)
  if (!target?.config) return widgets
  return widgets.map((w) =>
    w.id === widgetId ? withWidgetStyle(w, { zIndex: 0 }) : w
  )
}
