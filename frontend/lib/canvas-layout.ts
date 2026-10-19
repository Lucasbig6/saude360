import type { DashboardWidget } from "@/lib/types/dashboard"

/** Coordinates are CSS pixels in a fixed report page, never viewport pixels. */
export const CANVAS_LAYOUT_VERSION = 2
export const DEFAULT_REPORT_PAGE = { width: 1920, height: 1080 }
const LEGACY_CELL = { width: 100, height: 80 }

export type CanvasLayer = "background" | "data" | "foreground"


export interface CanvasGeometry {
  x: number
  y: number
  w: number
  h: number
  zIndex: number
  visible: boolean
  layer: CanvasLayer
}

export interface CanvasPageLayout {
  width: number
  height: number
  background?: string
}

/** Declarative, renderer-independent layout document. Widget config/data stay on DashboardWidget. */
export interface CanvasLayoutDocument {
  version: typeof CANVAS_LAYOUT_VERSION
  pages: Record<string, CanvasPageLayout>
  objects: Record<string, CanvasGeometry>
}

function finite(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function geometry(value: unknown, index: number): CanvasGeometry | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Partial<CanvasGeometry>
  const w = finite(raw.w, 0)
  const h = finite(raw.h, 0)
  if (w <= 0 || h <= 0) return null
  const layer: CanvasLayer =
    raw.layer === "background" || raw.layer === "foreground" ? raw.layer : "data"
  return {
    x: Math.max(0, finite(raw.x, 0)), y: Math.max(0, finite(raw.y, 0)),
    w: Math.max(24, w), h: Math.max(24, h), zIndex: Math.max(0, finite(raw.zIndex, index)),
    visible: raw.visible !== false,
    layer,
  }
}

export function readCanvasLayout(value: unknown): CanvasLayoutDocument | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Partial<CanvasLayoutDocument>
  if (raw.version !== CANVAS_LAYOUT_VERSION || !raw.objects || !raw.pages) return null
  const objects: Record<string, CanvasGeometry> = {}
  Object.entries(raw.objects).forEach(([id, item], index) => {
    const parsed = geometry(item, index)
    if (parsed) objects[id] = parsed
  })
  const pages: Record<string, CanvasPageLayout> = {}
  Object.entries(raw.pages).forEach(([id, page]) => {
    if (!page || typeof page !== "object") return
    const candidate = page as Partial<CanvasPageLayout>
    const background = typeof candidate.background === "string" ? candidate.background : undefined
    const normalized: CanvasPageLayout = { ...DEFAULT_REPORT_PAGE }
    if (background) normalized.background = background
    pages[id] = normalized
  })
  return { version: CANVAS_LAYOUT_VERSION, pages, objects }
}

/** Converts the previous 12-column/GridStack coordinates without mutating persisted records. */
export function legacyGeometry(widget: DashboardWidget, index: number): CanvasGeometry {
  // Drops from the free canvas already arrive in page pixels before their
  // first save creates v2. Legacy GridStack widths never exceed 12 columns.
  if (finite(widget.layout.w, 0) > 24 || finite(widget.layout.h, 0) > 24) {
    return { x: Math.max(0, finite(widget.layout.x, 0)), y: Math.max(0, finite(widget.layout.y, 0)), w: Math.max(80, finite(widget.layout.w, 320)), h: Math.max(64, finite(widget.layout.h, 180)), zIndex: index, visible: true, layer: "data" }
  }
  return {
    x: Math.max(0, finite(widget.layout.x, 0)) * LEGACY_CELL.width,
    y: Math.max(0, finite(widget.layout.y, 0)) * LEGACY_CELL.height,
    w: Math.max(120, finite(widget.layout.w, 4) * LEGACY_CELL.width - 16),
    h: Math.max(80, finite(widget.layout.h, 4) * LEGACY_CELL.height - 16),
    zIndex: index,
    visible: true,
    layer: "data",
  }
}

export function defaultLayerForConfig(
  config: { type: string } | null | undefined
): CanvasLayer {
  if (!config) return "data"
  if (config.type === "shape") return "background"
  if (config.type === "text" || config.type === "image") return "foreground"
  return "data"
}

export function layoutForWidgets(
  widgets: DashboardWidget[],
  pageIds: string[],
  existing?: CanvasLayoutDocument | null
): CanvasLayoutDocument {
  const pages = Object.fromEntries(pageIds.map((id) => [id, existing?.pages[id] ?? DEFAULT_REPORT_PAGE]))
  const objects = Object.fromEntries(widgets.map((widget, index) => {
    const existingGeometry = existing?.objects[widget.id]
    if (existingGeometry) return [widget.id, existingGeometry]
    const base = legacyGeometry(widget, index)
    return [widget.id, { ...base, layer: defaultLayerForConfig(widget.config) }]
  }))
  return { version: CANVAS_LAYOUT_VERSION, pages, objects }
}

export function applyGeometry(widgets: DashboardWidget[], document: CanvasLayoutDocument): DashboardWidget[] {
  return widgets.map((widget, index) => {
    const item = document.objects[widget.id] ?? legacyGeometry(widget, index)
    return { ...widget, layout: { x: Math.round(item.x), y: Math.round(item.y), w: Math.round(item.w), h: Math.round(item.h) } }
  })
}

export type CanvasOperation =
  | { type: "create-object"; id: string; geometry: CanvasGeometry }
  | { type: "set-geometry"; id: string; geometry: Partial<CanvasGeometry> }
  | { type: "delete-object"; id: string }

/** Pure operations are the future safe boundary for AI/layout automation. */
export function applyCanvasOperation(document: CanvasLayoutDocument, operation: CanvasOperation): CanvasLayoutDocument {
  const objects = { ...document.objects }
  if (operation.type === "delete-object") delete objects[operation.id]
  else if (operation.type === "create-object") objects[operation.id] = operation.geometry
  else {
    const previous = objects[operation.id]
    if (previous) objects[operation.id] = { ...previous, ...operation.geometry }
  }
  return { ...document, objects }
}
