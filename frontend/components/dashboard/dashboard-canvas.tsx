"use client"

import { createContext, useContext, useEffect, useMemo, useRef } from "react"
import type { PointerEvent } from "react"
import { useGridStack, useGridStackItem } from "gridstack/dist/react"
import type { ComponentMap } from "gridstack/dist/react"
import type { Dashboard, DashboardFilter } from "@/lib/types/dashboard"
import { DashboardWidgetView } from "./dashboard-widget"
import { GridstackCanvas } from "./gridstack-canvas"
import type { CanvasItem } from "./gridstack-canvas"

export type { CanvasItem } from "./gridstack-canvas"
export interface CanvasDropAnalysisData {
  analysisId?: string
  config?: import("@/lib/types/widgets").WidgetConfig
  x: number
  y: number
  w: number
  h: number
}

interface DashboardCanvasValue {
  widgets: Dashboard["widgets"]
  filters: DashboardFilter[]
  editing: boolean
  readOnly: boolean
  filterValues: Record<string, string | string[]>
  distinctValues: Record<string, string[]>
  loadingDistinct: boolean
  onFilterValueChange?: (filterId: string, value: string | string[]) => void
  refreshKey: number
  publicMode: boolean
  selectedWidgetId: string | null
  onRemove: (widgetId: string) => void
  onConfigure?: (widgetId: string) => void
  onSelectWidget?: (widgetId: string | null) => void
  onDuplicateWidget?: (widgetId: string) => void
  onCopyWidget?: (widgetId: string) => void
  onBringToFront?: (widgetId: string) => void
  onSendToBack?: (widgetId: string) => void
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

  const isSelected = ctx.selectedWidgetId === widget.id

  return (
    <div
      ref={rootRef}
      className="relative h-full"
      data-widget-id={widget.id}
      aria-selected={ctx.editing ? isSelected : undefined}
      onClick={() => ctx.onSelectWidget?.(widget.id)}
    >
      {ctx.editing && (
        <>
          {/* Barra de arrasto */}
          <div className="grid-drag-handle absolute left-0 right-0 top-0 z-20 flex h-6 cursor-grab items-center justify-center rounded-t-xl bg-slate-100/80 hover:bg-slate-200/80 active:cursor-grabbing">
            <div className="flex gap-0.5">
              <span className="block h-0.5 w-4 rounded-full bg-slate-400" />
            </div>
          </div>
          {/* Botões de camada no hover */}
          {ctx.onBringToFront && ctx.onSendToBack && (
            <div className="absolute right-1 top-7 z-20 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                title="Trazer para frente"
                className="rounded bg-white/90 p-1 text-xs shadow-sm hover:bg-white"
                onClick={(e) => {
                  e.stopPropagation()
                  ctx.onBringToFront?.(widget.id)
                }}
              >
                ↑
              </button>
              <button
                type="button"
                title="Enviar para trás"
                className="rounded bg-white/90 p-1 text-xs shadow-sm hover:bg-white"
                onClick={(e) => {
                  e.stopPropagation()
                  ctx.onSendToBack?.(widget.id)
                }}
              >
                ↓
              </button>
            </div>
          )}
        </>
      )}
      {/* Borda de seleção */}
      {isSelected && (
        <div className="pointer-events-none absolute inset-0 z-10 rounded-lg ring-2 ring-primary" />
      )}
      <div className={ctx.editing ? "pt-6 h-full" : "h-full"}>
        <DashboardWidgetView
          key={`${widget.id}-${ctx.refreshKey}`}
          widget={widget}
          filters={ctx.filters}
          filterValues={ctx.filterValues}
          onRemove={ctx.onRemove}
          onConfigure={ctx.onConfigure}
          onDuplicateWidget={ctx.onDuplicateWidget}
          onCopyWidget={ctx.onCopyWidget}
          onBringToFront={ctx.onBringToFront}
          onSendToBack={ctx.onSendToBack}
          readOnly={ctx.readOnly}
          publicMode={ctx.publicMode}
          distinctValues={ctx.distinctValues}
          loadingDistinct={ctx.loadingDistinct}
          onFilterValueChange={ctx.onFilterValueChange}
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
  distinctValues?: Record<string, string[]>
  loadingDistinct?: boolean
  onFilterValueChange?: (filterId: string, value: string | string[]) => void
  refreshKey?: number
  publicMode?: boolean
  selectedWidgetId?: string | null
  onRemoveWidget?: (widgetId: string) => void
  onConfigure?: (widgetId: string) => void
  onSelectWidget?: (widgetId: string | null) => void
  onDuplicateWidget?: (widgetId: string) => void
  onCopyWidget?: (widgetId: string) => void
  onBringToFront?: (widgetId: string) => void
  onSendToBack?: (widgetId: string) => void
  onLayoutChange?: (items: CanvasItem[]) => void
  onDropAnalysis?: (data: CanvasDropAnalysisData) => void
  className?: string
}

export function DashboardCanvas({
  dashboard,
  editing = false,
  readOnly = false,
  filterValues,
  distinctValues = {},
  loadingDistinct = false,
  onFilterValueChange,
  refreshKey = 0,
  publicMode = false,
  selectedWidgetId = null,
  onRemoveWidget,
  onConfigure,
  onSelectWidget,
  onDuplicateWidget,
  onCopyWidget,
  onBringToFront,
  onSendToBack,
  onLayoutChange,
  onDropAnalysis,
  className,
}: DashboardCanvasProps) {
  // GridStack usa coordenadas de grade (12 colunas, 80px cell height).
  // widget.layout armazena essas coordenadas diretamente.
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
      distinctValues,
      loadingDistinct,
      onFilterValueChange,
      refreshKey,
      publicMode,
      selectedWidgetId,
      onRemove: onRemoveWidget ?? noop,
      onConfigure,
      onSelectWidget,
      onDuplicateWidget,
      onCopyWidget,
      onBringToFront,
      onSendToBack,
    }),
    [
      dashboard.widgets,
      dashboard.filters,
      editing,
      readOnly,
      filterValues,
      distinctValues,
      loadingDistinct,
      onFilterValueChange,
      refreshKey,
      publicMode,
      selectedWidgetId,
      onRemoveWidget,
      onConfigure,
      onSelectWidget,
      onDuplicateWidget,
      onCopyWidget,
      onBringToFront,
      onSendToBack,
    ]
  )

  // Clique no fundo do canvas (fora de qualquer item do grid) desseleciona.
  function handleBackgroundPointerDown(event: PointerEvent) {
    if (!editing || !onSelectWidget) return
    if (selectedWidgetId === null) return
    const target = event.target as HTMLElement | null
    if (target?.closest?.(".grid-stack-item")) return
    onSelectWidget(null)
  }

  return (
    <DashboardCanvasContext.Provider value={value}>
      <div onPointerDown={handleBackgroundPointerDown}>
        <GridstackCanvas
          items={items}
          editable={editing && !readOnly}
          components={PORTAL_COMPONENTS}
          onLayoutChange={onLayoutChange}
          onDropAnalysis={onDropAnalysis}
          className={className}
        />
      </div>
    </DashboardCanvasContext.Provider>
  )
}
