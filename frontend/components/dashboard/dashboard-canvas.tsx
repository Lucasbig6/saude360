"use client"

import { createContext, useContext, useMemo } from "react"
import type { Dashboard, DashboardFilter } from "@/lib/types/dashboard"
import { DashboardWidgetView } from "./dashboard-widget"
import {
  CanvasStage,
  type CanvasStageDropData,
  type CanvasStageItem,
} from "./canvas-stage"
import {
  DEFAULT_REPORT_PAGE,
  defaultLayerForConfig,
  geometryForCanvas,
  readCanvasLayout,
} from "@/lib/canvas-layout"

export type { CanvasStageDropData as CanvasDropAnalysisData }

interface DashboardCanvasValue {
  widgets: Dashboard["widgets"]
  filters: DashboardFilter[]
  editing: boolean
  readOnly: boolean
  filterValues: Record<string, string | string[]>
  distinctValues: Record<string, string[]>
  loadingDistinct: Record<string, boolean>
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

function WidgetContent({ widgetId }: { widgetId: string }) {
  const ctx = useContext(DashboardCanvasContext)
  if (!ctx) return null
  const widget = ctx.widgets.find((w) => w.id === widgetId)
  if (!widget) return null

  return (
    <div className="relative h-full" data-widget-id={widget.id}>
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
  )
}

function noop() {
  /* remoção desativada em modo somente leitura */
}

interface DashboardCanvasProps {
  dashboard: Dashboard
  editing?: boolean
  readOnly?: boolean
  filterValues: Record<string, string | string[]>
  distinctValues?: Record<string, string[]>
  loadingDistinct?: Record<string, boolean>
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
  /** Geometria em pixels commitada pelo stage (move/resize). */
  onWidgetGeometryChange?: (
    widgetId: string,
    pixel: { x: number; y: number; w: number; h: number }
  ) => void
  onDropAnalysis?: (data: CanvasStageDropData) => void
  className?: string
}

export function DashboardCanvas({
  dashboard,
  editing = false,
  readOnly = false,
  filterValues,
  distinctValues = {},
  loadingDistinct = {},
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
  onWidgetGeometryChange,
  onDropAnalysis,
  className,
}: DashboardCanvasProps) {
  const layoutDocument = useMemo(
    () => readCanvasLayout(dashboard.appearance?.layoutDocument),
    [dashboard.appearance?.layoutDocument]
  )

  const pageId = dashboard.activePageId ?? dashboard.pages[0]?.id ?? ""
  const page = layoutDocument?.pages[pageId] ?? DEFAULT_REPORT_PAGE

  // Geometria pixel-authoritative do documento; widgets sem objeto pixel
  // derivam da grade (layouts v2 antigos — mesma posição visual).
  const items = useMemo<CanvasStageItem[]>(
    () =>
      dashboard.widgets.map((widget) => {
        const object = layoutDocument?.objects[widget.id]
        return {
          id: widget.id,
          pixel: geometryForCanvas(widget, layoutDocument, page),
          zIndex: object?.zIndex,
          layer: object?.layer ?? defaultLayerForConfig(widget.config),
          visible: object?.visible ?? true,
          styleZIndex: widget.config?.style?.zIndex,
        }
      }),
    [dashboard.widgets, layoutDocument, page]
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

  return (
    <DashboardCanvasContext.Provider value={value}>
      <CanvasStage
        page={page}
        items={items}
        editable={editing && !readOnly}
        selectedId={selectedWidgetId}
        onSelect={onSelectWidget}
        onGeometryChange={onWidgetGeometryChange}
        onDropAnalysis={onDropAnalysis}
        className={className}
      >
        {(item) => <WidgetContent widgetId={item.id} />}
      </CanvasStage>
    </DashboardCanvasContext.Provider>
  )
}
