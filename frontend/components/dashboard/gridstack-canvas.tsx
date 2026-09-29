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

const GRID_COLUMNS = 12

interface GridstackCanvasProps {
  items: CanvasItem[]
  editable?: boolean
  components: ComponentMap
  onLayoutChange?: (items: CanvasItem[]) => void
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
  className,
}: GridstackCanvasProps) {
  const handleRef = useRef<GridStackHandle>(null)
  const itemsRef = useRef(items)
  const onLayoutChangeRef = useRef(onLayoutChange)
  const emitScheduledRef = useRef(false)

  // Os eventos do GridStack disparam dentro dos efeitos do wrapper (filho);
  // sincronizar as refs em efeito de layout garante valores frescos antes
  // da drenagem dos microtasks em que a emissão é adiada.
  useIsomorphicLayoutEffect(() => {
    itemsRef.current = items
    onLayoutChangeRef.current = onLayoutChange
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

  return (
    <GridStack
      ref={handleRef}
      options={options}
      components={components}
      className={className}
      onChange={scheduleEmit}
      onAdded={scheduleEmit}
    />
  )
}
