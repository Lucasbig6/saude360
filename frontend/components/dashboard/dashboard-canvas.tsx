"use client"

import { createContext, useContext, useEffect, useMemo, useRef } from "react"
import { useGridStack, useGridStackItem } from "gridstack/dist/react"
import type { ComponentMap } from "gridstack/dist/react"
import type { Dashboard, DashboardFilter } from "@/lib/types/dashboard"
import { DashboardWidgetView } from "./dashboard-widget"
import { GridstackCanvas } from "./gridstack-canvas"
import type { CanvasItem, GridDropAnalysisData } from "./gridstack-canvas"

interface DashboardCanvasValue {
  widgets: Dashboard["widgets"]
  filters: DashboardFilter[]
  editing: boolean
  readOnly: boolean
  filterValues: Record<string, string | string[]>
  refreshKey: number
  onRemove: (widgetId: string) => void
  onConfigure?: (widgetId: string) => void
}

const DashboardCanvasContext = createContext<DashboardCanvasValue | null>(null)

function WidgetPortal() {
  const ctx = useContext(DashboardCanvasContext)
  const { grid } = useGridStack()
  const { id } = useGridStackItem()
  const rootRef = useRef<HTMLDivElement>(null)

  // O handle de arrasto vive dentro do conteúdo React: re-scan após cada
  // render para o GridStack conseguir anexar os listeners.
  useEffect(() => {
    const itemEl = rootRef.current?.closest(".grid-stack-item") as HTMLElement | null
    if (itemEl) grid?.refreshDragHandles(itemEl)
  })

  if (!ctx) return null
  const widget = ctx.widgets.find((w) => w.id === id)
  if (!widget) return null

  return (
    <div ref={rootRef} className="relative h-full">
      {ctx.editing && (
        <div className="grid-drag-handle absolute left-0 right-0 top-0 z-20 flex h-6 cursor-grab items-center justify-center rounded-t-xl bg-slate-100/80 hover:bg-slate-200/80 active:cursor-grabbing">
          <div className="flex gap-0.5">
            <span className="block h-0.5 w-4 rounded-full bg-slate-400" />
          </div>
        </div>
      )}
      <div className={ctx.editing ? "pt-6 h-full" : "h-full"}>
        <DashboardWidgetView
          key={`${widget.id}-${ctx.refreshKey}`}
          widget={widget}
          filters={ctx.filters}
          filterValues={ctx.filterValues}
          onRemove={ctx.onRemove}
          onConfigure={ctx.onConfigure}
          readOnly={ctx.readOnly}
        />
      </div>
    </div>
  )
}

const PORTAL_COMPONENTS: ComponentMap = { widget: WidgetPortal }

function noop() {
  /* remoção desativada em modo somente leitura */
}

interface DashboardCanvasProps {
  dashboard: Dashboard
  editing?: boolean
  readOnly?: boolean
  filterValues: Record<string, string | string[]>
  refreshKey?: number
  onRemoveWidget?: (widgetId: string) => void
  onConfigure?: (widgetId: string) => void
  onLayoutChange?: (items: CanvasItem[]) => void
  onDropAnalysis?: (data: GridDropAnalysisData) => void
  className?: string
}

export function DashboardCanvas({
  dashboard,
  editing = false,
  readOnly = false,
  filterValues,
  refreshKey = 0,
  onRemoveWidget,
  onConfigure,
  onLayoutChange,
  onDropAnalysis,
  className,
}: DashboardCanvasProps) {
  const items = useMemo<CanvasItem[]>(
    () =>
      dashboard.widgets.map((w) => ({
        id: w.id,
        x: w.layout.x,
        y: w.layout.y,
        w: w.layout.w,
        h: w.layout.h,
      })),
    [dashboard.widgets]
  )

  const value = useMemo<DashboardCanvasValue>(
    () => ({
      widgets: dashboard.widgets,
      filters: dashboard.filters,
      editing,
      readOnly,
      filterValues,
      refreshKey,
      onRemove: onRemoveWidget ?? noop,
      onConfigure,
    }),
    [
      dashboard.widgets,
      dashboard.filters,
      editing,
      readOnly,
      filterValues,
      refreshKey,
      onRemoveWidget,
      onConfigure,
    ]
  )

  return (
    <DashboardCanvasContext.Provider value={value}>
      <GridstackCanvas
        items={items}
        editable={editing}
        components={PORTAL_COMPONENTS}
        onLayoutChange={onLayoutChange}
        onDropAnalysis={onDropAnalysis}
        className={className}
      />
    </DashboardCanvasContext.Provider>
  )
}

