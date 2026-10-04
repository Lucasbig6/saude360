"use client"

import { useCallback, useEffect, useMemo, useRef, useLayoutEffect } from "react"
import { GridStack } from "gridstack/dist/react"
import type { GridStack as GridStackEngine } from "gridstack"
import type {
  ComponentMap,
  GridStackHandle,
  GridStackOptions,
  GridStackWidget,
} from "gridstack/dist/react"

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect

export interface CanvasItem {
  id: string
  x: number
  y: number
  w: number
  h: number
}

export interface GridDropAnalysisData {
  analysisId: string
  x: number
  y: number
  w: number
  h: number
}

const GRID_COLUMNS = 12

interface GridstackCanvasProps {
  items: CanvasItem[]
  editable?: boolean
  components: ComponentMap
  onLayoutChange?: (items: CanvasItem[]) => void
  onDropAnalysis?: (data: GridDropAnalysisData) => void
  className?: string
}

function readSnapshot(grid: GridStackEngine): CanvasItem[] {
  // save(colunas=12) devolve as coordenadas canônicas mesmo quando a grade
  // está temporariamente reduzida pelos breakpoints responsivos.
  const saved = grid.save(false, false, undefined, GRID_COLUMNS) as GridStackWidget[]
  const items: CanvasItem[] = []
  for (const node of saved) {
    if (typeof node.id !== "string") continue
    if (
      typeof node.x !== "number" ||
      typeof node.y !== "number" ||
      typeof node.w !== "number" ||
      typeof node.h !== "number"
    ) {
      continue
    }
    items.push({ id: node.id, x: node.x, y: node.y, w: node.w, h: node.h })
  }
  return items
}

function sameLayout(a: CanvasItem[], b: CanvasItem[]): boolean {
  if (a.length !== b.length) return false
  const previous = new Map(b.map((item) => [item.id, item]))
  return a.every((item) => {
    const prev = previous.get(item.id)
    return (
      prev !== undefined &&
      prev.x === item.x &&
      prev.y === item.y &&
      prev.w === item.w &&
      prev.h === item.h
    )
  })
}

export function GridstackCanvas({
  items,
  editable = false,
  components,
  onLayoutChange,
  onDropAnalysis,
  className,
}: GridstackCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<GridStackHandle>(null)
  const itemsRef = useRef(items)
  const onLayoutChangeRef = useRef(onLayoutChange)
  const onDropAnalysisRef = useRef(onDropAnalysis)
  const emitScheduledRef = useRef(false)

  // Os eventos do GridStack disparam dentro dos efeitos do wrapper (filho);
  // sincronizar as refs em efeito de layout garante valores frescos antes
  // da drenagem dos microtasks em que a emissão é adiada.
  useIsomorphicLayoutEffect(() => {
    itemsRef.current = items
    onLayoutChangeRef.current = onLayoutChange
    onDropAnalysisRef.current = onDropAnalysis
  })

  const children = useMemo(
    () =>
      items.map((item) => ({
        id: item.id,
        x: item.x,
        // y=Infinity ("novo, embaixo") vira ausente: o GridStack posiciona sozinho
        y: Number.isFinite(item.y) ? item.y : undefined,
        w: item.w,
        h: item.h,
        component: "widget",
      })),
    [items]
  )

  const options: GridStackOptions = useMemo(
    () => ({
      column: GRID_COLUMNS,
      cellHeight: 80,
      margin: 16,
      float: false,
      acceptWidgets: ".grid-stack-item-drag-in",
      columnOpts: {
        columnMax: GRID_COLUMNS,
        breakpointForWindow: true,
        breakpoints: [
          { w: 1024, c: 10 },
          { w: 768, c: 6 },
        ],
      },
      draggable: { handle: ".grid-drag-handle" },
      children,
    }),
    [children]
  )

  // Emite apenas quando o snapshot difere do estado do chamador: eventos
  // disparados pelo próprio load() de sincronização não realimentam o estado.
  // A drenagem do microtask ocorre após todos os efeitos de layout do commit,
  // quando as refs já refletem o estado recém-comprometido.
  const scheduleEmit = useCallback(() => {
    if (emitScheduledRef.current) return
    emitScheduledRef.current = true
    queueMicrotask(() => {
      emitScheduledRef.current = false
      const grid = handleRef.current?.getGrid()
      if (!grid || !onLayoutChangeRef.current) return
      const next = readSnapshot(grid)
      if (sameLayout(next, itemsRef.current)) return
      onLayoutChangeRef.current(next)
    })
  }, [])

  // O init roda antes do registro dos handlers: após a montagem, verifica se
  // o posicionamento automático (ex.: y=Infinity) divergiu do estado informado.
  useEffect(() => {
    scheduleEmit()
  }, [scheduleEmit])

  useEffect(() => {
    const grid = handleRef.current?.getGrid()
    if (!grid) return
    grid.enableMove(editable)
    grid.enableResize(editable)
  }, [editable])

  // Drag & drop HTML5 nativo. Ele evita a competição entre o adaptador de
  // drag do GridStack e os handlers React da biblioteca lateral.
  const handleHtml5DragOver = useCallback((e: React.DragEvent) => {
    if (!editable) return
    if (!e.dataTransfer) return
    if (
      e.dataTransfer.types.includes("application/json") ||
      e.dataTransfer.types.includes("text/plain")
    ) {
      e.preventDefault()
      e.dataTransfer.dropEffect = "copy"
    }
  }, [editable])

  const handleHtml5Drop = useCallback((e: React.DragEvent) => {
    if (!editable || !onDropAnalysisRef.current) return
    const dataTransfer = e.dataTransfer
    if (!dataTransfer) return
    const jsonStr = dataTransfer.getData("application/json")
    const plainId = dataTransfer.getData("text/plain")

    let analysisId: string | null = null
    let w = 6
    let h = 4

    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr)
        if (parsed?.analysisId) {
          analysisId = parsed.analysisId
          w = parsed.w ?? 6
          h = parsed.h ?? 4
        }
      } catch {
        // ignora erro de parse
      }
    }

    if (!analysisId && plainId) {
      analysisId = plainId
    }

    if (!analysisId) return
    e.preventDefault()

    const container = containerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    const relX = Math.max(0, e.clientX - rect.left)
    const relY = Math.max(0, e.clientY - rect.top)

    const colWidth = rect.width / GRID_COLUMNS
    const rowHeight = 96 // cellHeight (80) + margin (16)

    const x = Math.min(GRID_COLUMNS - 1, Math.max(0, Math.floor(relX / colWidth)))
    const y = Math.max(0, Math.floor(relY / rowHeight))

    onDropAnalysisRef.current({
      analysisId,
      x,
      y,
      w,
      h,
    })
  }, [editable])

  return (
    <div
      ref={containerRef}
      onDragOver={handleHtml5DragOver}
      onDrop={handleHtml5Drop}
      className="relative w-full"
    >
      <GridStack
        ref={handleRef}
        options={options}
        components={components}
        className={className}
        onChange={scheduleEmit}
        onAdded={scheduleEmit}
      />
    </div>
  )
}
