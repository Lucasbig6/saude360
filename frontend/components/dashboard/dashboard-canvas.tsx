"use client"

import { useMemo } from "react"
import type { Dashboard, DashboardFilter } from "@/lib/types/dashboard"
import { DEFAULT_REPORT_PAGE, layoutForWidgets, readCanvasLayout } from "@/lib/canvas-layout"
import { CanvasStage, type CanvasDropAnalysisData, type CanvasItem } from "./canvas-stage"
import { DashboardWidgetView } from "./dashboard-widget"

export type { CanvasDropAnalysisData, CanvasItem } from "./canvas-stage"

interface DashboardCanvasProps {
  dashboard: Dashboard; editing?: boolean; readOnly?: boolean; filterValues: Record<string, string | string[]>; distinctValues?: Record<string, string[]>; loadingDistinct?: boolean
  onFilterValueChange?: (filterId: string, value: string | string[]) => void; refreshKey?: number; publicMode?: boolean; selectedWidgetId?: string | null
  onRemoveWidget?: (widgetId: string) => void; onConfigure?: (widgetId: string) => void; onSelectWidget?: (widgetId: string | null) => void; onDuplicateWidget?: (widgetId: string) => void; onCopyWidget?: (widgetId: string) => void; onBringToFront?: (widgetId: string) => void; onSendToBack?: (widgetId: string) => void
  onLayoutChange?: (items: CanvasItem[]) => void; onDropAnalysis?: (data: CanvasDropAnalysisData) => void; className?: string
}

/** Konva owns spatial interaction; real widgets remain HTML so ECharts, controls and accessibility keep working. */
export function DashboardCanvas({ dashboard, editing = false, readOnly = false, filterValues, distinctValues = {}, loadingDistinct = false, onFilterValueChange, refreshKey = 0, publicMode = false, selectedWidgetId = null, onRemoveWidget, onConfigure, onSelectWidget, onDuplicateWidget, onCopyWidget, onBringToFront, onSendToBack, onLayoutChange, onDropAnalysis, className }: DashboardCanvasProps) {
  const document = useMemo(() => layoutForWidgets(dashboard.widgets, dashboard.pages.map(p => p.id), readCanvasLayout(dashboard.appearance?.layoutDocument)), [dashboard.widgets, dashboard.pages, dashboard.appearance])
  const pageId = dashboard.activePageId ?? dashboard.pages[0]?.id ?? "default"
  const page = document.pages[pageId] ?? DEFAULT_REPORT_PAGE
  const items = dashboard.widgets.map((widget, index) => {
    const geometry = document.objects[widget.id] ?? { x: widget.layout.x, y: widget.layout.y, w: widget.layout.w, h: widget.layout.h, zIndex: index, visible: true }
    return { id: widget.id, ...geometry, zIndex: widget.config?.style?.zIndex ?? geometry.zIndex }
  })
  return <div className={className}>
    <div className="flex min-w-0 gap-3">
    <div className="min-w-0 flex-1"><CanvasStage items={items} page={page} editable={editing && !readOnly} selectedId={selectedWidgetId} onSelect={onSelectWidget} onLayoutChange={onLayoutChange} onDropAnalysis={onDropAnalysis}>
      {(item, style) => {
        const widget = dashboard.widgets.find(w => w.id === item.id)
        if (!widget) return null
        return <div style={style} data-widget-id={item.id} aria-selected={editing ? selectedWidgetId === item.id : undefined}>
          <DashboardWidgetView key={`${widget.id}-${refreshKey}`} widget={widget} filters={dashboard.filters as DashboardFilter[]} filterValues={filterValues} onRemove={onRemoveWidget ?? (() => {})} onConfigure={onConfigure} onDuplicateWidget={onDuplicateWidget} onCopyWidget={onCopyWidget} onBringToFront={onBringToFront} onSendToBack={onSendToBack} readOnly={readOnly} publicMode={publicMode} distinctValues={distinctValues} loadingDistinct={loadingDistinct} onFilterValueChange={onFilterValueChange} />
        </div>
      }}
    </CanvasStage>
    </div>
    {editing && <aside aria-label="Camadas" className="hidden w-44 shrink-0 rounded-xl border border-border bg-card p-2 lg:block"><p className="px-1 pb-2 text-xs font-medium text-muted-foreground">Camadas</p>{[...items].sort((a, b) => b.zIndex - a.zIndex).map(item => <button key={item.id} type="button" className={`mb-1 flex w-full items-center rounded px-2 py-1.5 text-left text-xs ${selectedWidgetId === item.id ? "bg-primary/10 text-primary" : "hover:bg-muted"}`} onClick={() => onSelectWidget?.(item.id)}>{dashboard.widgets.find(w => w.id === item.id)?.config?.title ?? "Widget"}</button>)}</aside>}
    </div>
  </div>
}
