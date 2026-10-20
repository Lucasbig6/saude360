"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import type {
  CSSProperties,
  DragEvent as ReactDragEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react"
import type { WidgetConfig } from "@/lib/types/widgets"
import {
  gridSize,
  type CanvasLayer,
  type CanvasPageLayout,
  type PixelRect,
} from "@/lib/canvas-layout"
import { cn } from "@/lib/utils"

/** Offset de stacking por camada: background < data < foreground. */
export const LAYER_Z_OFFSET: Record<CanvasLayer, number> = {
  background: 0,
  data: 1000,
  foreground: 2000,
}

export const STAGE_MIN_WIDTH = 40
export const STAGE_MIN_HEIGHT = 24

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect

const RESIZE_EDGES = ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const
type ResizeEdge = (typeof RESIZE_EDGES)[number]

const RESIZE_HANDLE_STYLE: Record<ResizeEdge, string> = {
  n: "top-0 left-1/2 -translate-x-1/2 w-4 h-1.5 cursor-ns-resize",
  s: "bottom-0 left-1/2 -translate-x-1/2 w-4 h-1.5 cursor-ns-resize",
  e: "right-0 top-1/2 -translate-y-1/2 w-1.5 h-4 cursor-ew-resize",
  w: "left-0 top-1/2 -translate-y-1/2 w-1.5 h-4 cursor-ew-resize",
  ne: "top-0 right-0 w-2.5 h-2.5 cursor-nesw-resize",
  nw: "top-0 left-0 w-2.5 h-2.5 cursor-nwse-resize",
  se: "bottom-0 right-0 w-2.5 h-2.5 cursor-nwse-resize",
  sw: "bottom-0 left-0 w-2.5 h-2.5 cursor-nesw-resize",
}

export interface CanvasStageItem {
  id: string
  pixel: PixelRect
  /** zIndex do layoutDocument (objects.zIndex). */
  zIndex?: number
  layer?: CanvasLayer
  visible?: boolean
  /** zIndex estilístico do config (bringToFront) — prevalece dentro da camada. */
  styleZIndex?: number
}

export interface CanvasStageDropData {
  analysisId?: string
  config?: WidgetConfig
  x: number
  y: number
  w: number
  h: number
}

/** Arestas de alinhamento à página (Power BI-style). */
export type PageAlignEdge = "left" | "center-h" | "right" | "top" | "middle" | "bottom"

interface CanvasStageProps {
  page: CanvasPageLayout
  items: CanvasStageItem[]
  editable?: boolean
  selectedId?: string | null
  onSelect?: (id: string | null) => void
  onGeometryChange?: (id: string, pixel: PixelRect) => void
  onDropAnalysis?: (data: CanvasStageDropData) => void
  children: (item: CanvasStageItem) => ReactNode
  className?: string
}

interface StageInteraction {
  kind: "move" | "resize"
  id: string
  edge?: ResizeEdge
  pointerX: number
  pointerY: number
  origin: PixelRect
}

export function clampStageRect(rect: PixelRect, page: CanvasPageLayout): PixelRect {
  const w = Math.round(Math.min(Math.max(rect.w, STAGE_MIN_WIDTH), page.width))
  const h = Math.round(Math.min(Math.max(rect.h, STAGE_MIN_HEIGHT), page.height))
  const x = Math.round(Math.min(Math.max(rect.x, 0), Math.max(0, page.width - w)))
  const y = Math.round(Math.min(Math.max(rect.y, 0), Math.max(0, page.height - h)))
  return { x, y, w, h }
}

export function resizeStageRect(
  origin: PixelRect,
  edge: ResizeEdge,
  dx: number,
  dy: number
): PixelRect {
  let { x, y, w, h } = origin
  if (edge.includes("e")) w = origin.w + dx
  if (edge.includes("s")) h = origin.h + dy
  if (edge.includes("w")) {
    w = origin.w - dx
    x = origin.x + dx
  }
  if (edge.includes("n")) {
    h = origin.h - dy
    y = origin.y + dy
  }
  if (w < STAGE_MIN_WIDTH) {
    if (edge.includes("w")) x = origin.x + origin.w - STAGE_MIN_WIDTH
    w = STAGE_MIN_WIDTH
  }
  if (h < STAGE_MIN_HEIGHT) {
    if (edge.includes("n")) y = origin.y + origin.h - STAGE_MIN_HEIGHT
    h = STAGE_MIN_HEIGHT
  }
  return { x, y, w, h }
}

function stageZIndex(item: CanvasStageItem): number {
  const layer = item.layer ?? "data"
  const z = item.styleZIndex ?? item.zIndex ?? 0
  return LAYER_Z_OFFSET[layer] + Math.max(0, Math.min(1000, Math.floor(z)))
}

export function CanvasStage({
  page,
  items,
  editable = false,
  selectedId = null,
  onSelect,
  onGeometryChange,
  onDropAnalysis,
  children,
  className,
}: CanvasStageProps) {
  const outerRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const interactionRef = useRef<StageInteraction | null>(null)
  const draftRef = useRef<Record<string, PixelRect>>({})
  const [draft, setDraft] = useState<Record<string, PixelRect>>({})
  const [containerWidth, setContainerWidth] = useState(0)
  const pageBoundsRef = useRef(page)
  const onSelectRef = useRef(onSelect)
  const onGeometryChangeRef = useRef(onGeometryChange)
  const onDropAnalysisRef = useRef(onDropAnalysis)

  // Fit-to-width: a página (1920) é escalada para a largura disponível —
  // editor e viewer sem transbordo. Coord. de ponteiro são divididas pelo
  // scale para voltar ao espaço de página.
  const scale =
    containerWidth > 0 && page.width > 0 ? containerWidth / page.width : 1
  const scaleRef = useRef(scale)

  useIsomorphicLayoutEffect(() => {
    const el = outerRef.current
    if (!el) return
    const update = () => setContainerWidth(el.clientWidth)
    update()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    pageBoundsRef.current = page
    onSelectRef.current = onSelect
    onGeometryChangeRef.current = onGeometryChange
    onDropAnalysisRef.current = onDropAnalysis
    scaleRef.current = scale
  })

  const rectFor = useCallback(
    (item: CanvasStageItem): PixelRect => draftRef.current[item.id] ?? item.pixel,
    []
  )

  const beginInteraction = useCallback(
    (event: ReactPointerEvent<HTMLElement>, item: CanvasStageItem, edge?: ResizeEdge) => {
      if (!editable) return
      event.preventDefault()
      event.stopPropagation()
      onSelectRef.current?.(item.id)
      interactionRef.current = {
        kind: edge ? "resize" : "move",
        id: item.id,
        ...(edge ? { edge } : {}),
        pointerX: event.clientX,
        pointerY: event.clientY,
        origin: rectFor(item),
      }
      const target = event.currentTarget as HTMLElement & {
        setPointerCapture?: (id: number) => void
      }
      try {
        target.setPointerCapture?.(event.pointerId)
      } catch {
        // jsdom/navegadores sem capture: window listeners cobrem o arrasto
      }
    },
    [editable, rectFor]
  )

  useEffect(() => {
    if (!editable) return

    function handlePointerMove(event: PointerEvent) {
      const interaction = interactionRef.current
      if (!interaction) return
      const currentScale = scaleRef.current || 1
      const dx = (event.clientX - interaction.pointerX) / currentScale
      const dy = (event.clientY - interaction.pointerY) / currentScale
      const next =
        interaction.kind === "move"
          ? clampStageRect(
              { ...interaction.origin, x: interaction.origin.x + dx, y: interaction.origin.y + dy },
              pageBoundsRef.current
            )
          : clampStageRect(
              resizeStageRect(interaction.origin, interaction.edge ?? "se", dx, dy),
              pageBoundsRef.current
            )
      draftRef.current = { ...draftRef.current, [interaction.id]: next }
      setDraft(draftRef.current)
    }

    function finishInteraction(cancel: boolean) {
      const interaction = interactionRef.current
      if (!interaction) return
      interactionRef.current = null
      const rect = draftRef.current[interaction.id]
      const nextDraft = { ...draftRef.current }
      delete nextDraft[interaction.id]
      draftRef.current = nextDraft
      setDraft(nextDraft)
      if (!cancel && rect) onGeometryChangeRef.current?.(interaction.id, rect)
    }

    function handlePointerUp() {
      finishInteraction(false)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && interactionRef.current) {
        event.preventDefault()
        event.stopPropagation()
        finishInteraction(true)
      }
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("pointercancel", handlePointerUp)
    window.addEventListener("keydown", handleKeyDown, true)
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerUp)
      window.removeEventListener("keydown", handleKeyDown, true)
    }
  }, [editable])

  function handleBackgroundPointerDown(event: ReactPointerEvent) {
    if (!editable || !onSelectRef.current) return
    const target = event.target as HTMLElement | null
    if (target?.closest?.("[data-stage-item]")) return
    onSelectRef.current(null)
  }

  const handleHtml5DragOver = useCallback(
    (event: ReactDragEvent) => {
      if (!editable) return
      if (!event.dataTransfer) return
      if (
        event.dataTransfer.types.includes("application/json") ||
        event.dataTransfer.types.includes("text/plain")
      ) {
        event.preventDefault()
        event.dataTransfer.dropEffect = "copy"
      }
    },
    [editable]
  )

  const handleHtml5Drop = useCallback(
    (event: ReactDragEvent) => {
      if (!editable || !onDropAnalysisRef.current) return
      const dataTransfer = event.dataTransfer
      if (!dataTransfer) return
      const jsonStr = dataTransfer.getData("application/json")
      const plainId = dataTransfer.getData("text/plain")

      let analysisId: string | null = null
      let config: WidgetConfig | undefined

      if (jsonStr) {
        try {
          const parsed = JSON.parse(jsonStr)
          if (parsed?.analysisId) {
            analysisId = parsed.analysisId
          } else if (parsed?.config && typeof parsed.config.type === "string") {
            config = parsed.config as WidgetConfig
          }
        } catch {
          // ignora erro de parse
        }
      }
      if (!analysisId && plainId) analysisId = plainId
      if (!analysisId && !config) return
      event.preventDefault()

      const container = pageRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const currentScale = scaleRef.current || 1
      const { colWidth, rowHeight } = gridSize(pageBoundsRef.current)
      const x = Math.max(0, (event.clientX - rect.left) / currentScale)
      const y = Math.max(0, (event.clientY - rect.top) / currentScale)
      const w = analysisId ? colWidth * 6 : colWidth * 4
      const h = analysisId ? rowHeight * 4 : rowHeight * (config?.type === "text" ? 2 : 3)

      onDropAnalysisRef.current({
        ...(analysisId ? { analysisId } : {}),
        ...(config ? { config } : {}),
        ...clampStageRect({ x, y, w, h }, pageBoundsRef.current),
      })
    },
    [editable]
  )

  const pageStyle: CSSProperties = {
    width: page.width,
    height: page.height,
    transform: scale !== 1 ? `scale(${scale})` : undefined,
    transformOrigin: "top left",
    ...(page.background ? { background: page.background } : {}),
  }

  return (
    <div ref={outerRef} className={cn("relative w-full overflow-auto", className)}>
      {/* Holder com as dimensões VISUAIS (escaladas) — métrica correta de scroll. */}
      <div
        style={{
          width: containerWidth || page.width,
          height: page.height * scale,
          position: "relative",
        }}
      >
        <div
          ref={pageRef}
          data-canvas-stage=""
          className="absolute left-0 top-0"
          style={pageStyle}
          onPointerDown={handleBackgroundPointerDown}
          onDragOver={handleHtml5DragOver}
          onDrop={handleHtml5Drop}
        >
        {items.map((item) => {
          const rect = draft[item.id] ?? item.pixel
          const isSelected = editable && selectedId === item.id
          const itemStyle: CSSProperties = {
            left: rect.x,
            top: rect.y,
            width: rect.w,
            height: rect.h,
            zIndex: stageZIndex(item),
            ...(item.visible === false ? { display: "none" } : {}),
          }
          return (
            <div
              key={item.id}
              data-stage-item={item.id}
              aria-selected={editable ? isSelected : undefined}
              className="group absolute"
              style={itemStyle}
              onClick={(event) => {
                event.stopPropagation()
                onSelectRef.current?.(item.id)
              }}
            >
              {editable && (
                <div
                  className="absolute left-0 right-0 top-0 z-20 flex h-6 cursor-grab items-center justify-center rounded-t-xl bg-slate-100/80 hover:bg-slate-200/80 active:cursor-grabbing"
                  data-stage-handle={item.id}
                  onPointerDown={(event) => beginInteraction(event, item)}
                >
                  <span className="block h-0.5 w-4 rounded-full bg-slate-400" />
                </div>
              )}
              {isSelected && (
                <div className="pointer-events-none absolute inset-0 z-10 rounded-lg ring-2 ring-primary" />
              )}
              {isSelected &&
                RESIZE_EDGES.map((edge) => (
                  <div
                    key={edge}
                    data-stage-resize={`${item.id}:${edge}`}
                    className={cn(
                      "absolute z-20 rounded-sm bg-primary",
                      RESIZE_HANDLE_STYLE[edge]
                    )}
                    onPointerDown={(event) => beginInteraction(event, item, edge)}
                  />
                ))}
              <div className={editable ? "h-full pt-6" : "h-full"}>{children(item)}</div>
            </div>
          )
        })}
        </div>
      </div>
    </div>
  )
}
