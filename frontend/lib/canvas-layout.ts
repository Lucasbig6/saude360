import type { DashboardWidget } from "@/lib/types/dashboard"

/**
 * Documento declarativo de metadados do dashboard. A geometria em `objects`
 * espelha `widget.layout` em unidades de grade GridStack (12 colunas,
 * cellHeight 80) — a grade é a fonte da verdade do posicionamento.
 */
export const CANVAS_LAYOUT_VERSION = 2
export const DEFAULT_REPORT_PAGE = { width: 1920, height: 1080 }
/** Unidade de conversão da era pixel (canvas livre Konva / painel em pixels). */
const LEGACY_CELL = { width: 100, height: 80 }
export const GRID_COLUMNS = 12

export type CanvasLayer = "background" | "data" | "foreground"

/**
 * Unidade da geometria em `objects`. Ausente = grade (documentos v2
 * antigos). O editor livre grava `"pixel"`: nesse caso o objeto é
 * authoritative e o espelho em `widget.layout` (unidades de grade)
 * existe só para a API e consumidores legados.
 */
export type CanvasUnit = "grid" | "pixel"

export interface CanvasGeometry {
  x: number
  y: number
  w: number
  h: number
  zIndex: number
  visible: boolean
  layer: CanvasLayer
  unit?: CanvasUnit
}

export interface CanvasPageLayout {
  width: number
  height: number
  background?: string
}

/** Documento declarativo independente de renderer. Widget config/data ficam em DashboardWidget. */
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
  const unit: CanvasUnit | undefined =
    raw.unit === "pixel" || raw.unit === "grid" ? raw.unit : undefined
  return {
    x: Math.max(0, finite(raw.x, 0)), y: Math.max(0, finite(raw.y, 0)),
    w: Math.max(1, w), h: Math.max(1, h), zIndex: Math.max(0, finite(raw.zIndex, index)),
    visible: raw.visible !== false,
    layer,
    ...(unit ? { unit } : {}),
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

export interface GridLayout {
  x: number
  y: number
  w: number
  h: number
}

/** Altura de linha do GridStack em pixels: cellHeight (80) + margin (16). */
export const GRID_ROW_HEIGHT = 96

export function gridSize(page: CanvasPageLayout = DEFAULT_REPORT_PAGE): {
  colWidth: number
  rowHeight: number
} {
  return { colWidth: page.width / GRID_COLUMNS, rowHeight: GRID_ROW_HEIGHT }
}

export interface PixelRect {
  x: number
  y: number
  w: number
  h: number
}

/** Converte unidades de grade (12 col × 96px) para pixels na página. */
export function gridToPixelGeometry(
  layout: GridLayout,
  page: CanvasPageLayout = DEFAULT_REPORT_PAGE
): PixelRect {
  const { colWidth, rowHeight } = gridSize(page)
  return {
    x: layout.x * colWidth,
    y: layout.y * rowHeight,
    w: layout.w * colWidth,
    h: layout.h * rowHeight,
  }
}

/**
 * Espelho de grade arredondado/clampado a partir de pixels — o que vai em
 * `widget.layout` (colunas do banco) mantendo o contrato de 12 colunas.
 */
export function pixelToGridGeometry(
  pixel: PixelRect,
  page: CanvasPageLayout = DEFAULT_REPORT_PAGE
): GridLayout {
  const { colWidth, rowHeight } = gridSize(page)
  return {
    x: Math.min(GRID_COLUMNS - 1, Math.max(0, Math.round(pixel.x / colWidth))),
    y: Math.max(0, Math.round(pixel.y / rowHeight)),
    w: Math.min(GRID_COLUMNS, Math.max(1, Math.round(pixel.w / colWidth))),
    h: Math.max(1, Math.round(pixel.h / rowHeight)),
  }
}

/**
 * O painel de propriedades da era pixel gravava `w >= 24` e páginas de 1920px,
 * então qualquer `w > 12` (ou `x > 11`) só pode ser resíduo de pixel. Valores
 * com `h`/`y` extremos são pixels da era Konva (`y * 80`) sem passar pelo
 * painel. A inversão usa a mesma célula legada da conversão antiga.
 */
function looksPixelated(layout: GridLayout): boolean {
  return (
    layout.w > GRID_COLUMNS ||
    layout.x > GRID_COLUMNS - 1 ||
    layout.h > 60 ||
    layout.y > 300
  )
}

/** Converte coordenadas em pixels da era pixel de volta para unidades de grade. */
export function normalizeGridLayout(layout: GridLayout): GridLayout {
  if (!looksPixelated(layout)) {
    return {
      x: Math.max(0, Math.round(layout.x)),
      y: Math.max(0, Math.round(layout.y)),
      w: Math.max(1, Math.round(layout.w)),
      h: Math.max(1, Math.round(layout.h)),
    }
  }
  return {
    x: Math.min(GRID_COLUMNS - 1, Math.max(0, Math.round(layout.x / LEGACY_CELL.width))),
    y: Math.max(0, Math.round(layout.y / LEGACY_CELL.height)),
    w: Math.min(GRID_COLUMNS, Math.max(1, Math.round((layout.w + 16) / LEGACY_CELL.width))),
    h: Math.max(1, Math.round((layout.h + 16) / LEGACY_CELL.height)),
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

export function isPixelGeometry(
  geometry: CanvasGeometry | undefined | null
): geometry is CanvasGeometry & { unit: "pixel" } {
  return geometry?.unit === "pixel"
}

/**
 * Geometria em pixels de um widget no stage: objeto pixel-authoritative
 * do documento, ou derivação da grade de `widget.layout` (documentos v2
 * antigos — renderização idêntica, sem migração em massa).
 */
export function geometryForCanvas(
  widget: Pick<DashboardWidget, "id" | "layout">,
  document: CanvasLayoutDocument | null | undefined,
  page: CanvasPageLayout = DEFAULT_REPORT_PAGE
): PixelRect {
  const object = document?.objects[widget.id]
  if (isPixelGeometry(object)) {
    return { x: object.x, y: object.y, w: object.w, h: object.h }
  }
  return gridToPixelGeometry(widget.layout, page)
}

/**
 * Grava geometria pixel-authoritative para um widget, preservando
 * zIndex/visible/layer do objeto existente. Widget ausente do documento
 * recebe defaults (zIndex do índice, layer derivada da config).
 */
export function withPixelGeometry(
  document: CanvasLayoutDocument,
  widget: Pick<DashboardWidget, "id" | "config">,
  pixel: PixelRect
): CanvasLayoutDocument {
  const previous = document.objects[widget.id]
  const geometry: CanvasGeometry = {
    x: Math.max(0, Math.round(pixel.x)),
    y: Math.max(0, Math.round(pixel.y)),
    w: Math.max(1, Math.round(pixel.w)),
    h: Math.max(1, Math.round(pixel.h)),
    zIndex: previous?.zIndex ?? 0,
    visible: previous?.visible ?? true,
    layer: previous?.layer ?? defaultLayerForConfig(widget.config),
    unit: "pixel",
  }
  return {
    ...document,
    objects: { ...document.objects, [widget.id]: geometry },
  }
}

export function layoutForWidgets(
  widgets: DashboardWidget[],
  pageIds: string[],
  existing?: CanvasLayoutDocument | null
): CanvasLayoutDocument {
  const pages = Object.fromEntries(pageIds.map((id) => [id, existing?.pages[id] ?? DEFAULT_REPORT_PAGE]))
  const objects = Object.fromEntries(widgets.map((widget, index) => {
    const previous = existing?.objects[widget.id]
    // Objeto pixel-authoritative não é sobrescrito pelo espelho da grade:
    // o editor livre é a fonte da verdade; widget.layout segue como mirror.
    if (isPixelGeometry(previous)) {
      return [widget.id, previous]
    }
    return [widget.id, {
      x: Math.max(0, Math.round(widget.layout.x)),
      y: Math.max(0, Math.round(widget.layout.y)),
      w: Math.max(1, Math.round(widget.layout.w)),
      h: Math.max(1, Math.round(widget.layout.h)),
      zIndex: previous?.zIndex ?? index,
      visible: previous?.visible ?? true,
      layer: previous?.layer ?? defaultLayerForConfig(widget.config),
    }]
  }))
  return { version: CANVAS_LAYOUT_VERSION, pages, objects }
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
