"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  Activity,
  ExternalLink,
  Pencil,
  RefreshCw,
  Share2,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn, dashboardWidthClass } from "@/lib/utils"
import type { Dashboard } from "@/lib/types/dashboard"
import { DashboardWidgetView } from "./dashboard-widget"
import { ShareDashboardDialog } from "./share-dashboard-dialog"
import { DashboardCopilot } from "./dashboard-copilot"
import {
  ResponsiveGridLayout,
  useContainerWidth,
  verticalCompactor,
} from "react-grid-layout"

const GRID_COLS = { lg: 12, md: 10, sm: 6 }
const GRID_BREAKPOINTS = { lg: 1024, md: 768, sm: 0 }
const GRID_ROW_HEIGHT = 80
const GRID_MARGIN: [number, number] = [16, 16]

interface DashboardViewerProps {
  dashboard: Dashboard
  /** When true, shows a discreet link back to the editor (authenticated context). */
  canEdit?: boolean
  editHref?: string
  /**
   * Habilita o Copiloto (sessão de IA). Falso no painel público anônimo:
   * a IA não é exposta fora de uma sessão autenticada.
   */
  enableCopilot?: boolean
}

export function DashboardViewer({
  dashboard,
  canEdit = false,
  editHref,
  enableCopilot = false,
}: DashboardViewerProps) {
  const [shareOpen, setShareOpen] = useState(false)
  const [copilotOpen, setCopilotOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const isDark = dashboard.appearance?.theme === "dark"
  const showBrand = dashboard.appearance?.showBrand !== false

  const filterValues = useMemo(() => {
    const initial: Record<string, string | string[]> = {}
    for (const f of dashboard.filters) {
      initial[f.id] = f.defaultValue
    }
    return initial
  }, [dashboard.filters])

  const layouts = useMemo(() => {
    const lg = dashboard.widgets.map((w) => ({
      i: w.id,
      x: w.layout.x,
      y: w.layout.y,
      w: w.layout.w,
      h: w.layout.h,
    }))

    const md = lg.map((item) => ({
      ...item,
      w: Math.min(item.w, 10),
      x: Math.min(item.x, 10 - item.w),
    }))

    const sm = lg.map((item) => ({
      ...item,
      w: 6,
      x: 0,
      y: item.y,
    }))

    return { lg, md, sm }
  }, [dashboard.widgets])

  const { width, mounted, containerRef } = useContainerWidth({
    measureBeforeMount: true,
    initialWidth: 1280,
  })

  return (
    <div
      className={cn(
        "min-h-screen",
        isDark ? "dark bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900"
      )}
    >
      <div
        className={cn(
          dashboardWidthClass(dashboard.appearance),
          "px-4 sm:px-6 lg:px-8 py-6 sm:py-8 transition-[padding-right] duration-200",
          copilotOpen && "lg:pr-[24rem] xl:pr-[26rem]"
        )}
      >
        {/* Presentation header */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {showBrand && (
              <div className="mb-3 inline-flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 text-white shadow-sm">
                  <Activity size={16} strokeWidth={2.5} />
                </div>
                <span
                  className={cn(
                    "text-sm font-semibold tracking-wide",
                    isDark ? "text-teal-400" : "text-teal-700"
                  )}
                >
                   Saude360
                </span>
              </div>
            )}

            <h1
              className={cn(
                "text-2xl font-semibold tracking-tight sm:text-3xl",
                isDark ? "text-white" : "text-slate-900"
              )}
            >
              {dashboard.name}
            </h1>
            {dashboard.description && (
              <p
                className={cn(
                  "mt-1 max-w-2xl text-sm",
                  isDark ? "text-slate-400" : "text-slate-500"
                )}
              >
                {dashboard.description}
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {enableCopilot && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCopilotOpen((v) => !v)}
                aria-expanded={copilotOpen}
                aria-controls="dashboard-copilot-panel"
                className={cn(
                  isDark
                    ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                    : "border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100"
                )}
                title="Abrir copiloto de análise"
              >
                <Sparkles size={14} />
                Copiloto
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setRefreshKey((k) => k + 1)}
              className={cn(
                isDark
                  ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                  : "bg-white"
              )}
              title="Atualizar dados"
            >
              <RefreshCw size={14} />
              Atualizar
            </Button>

            <Button
              size="sm"
              onClick={() => setShareOpen(true)}
              className="bg-teal-600 text-white hover:bg-teal-700"
            >
              <Share2 size={14} />
              Compartilhar
            </Button>

            {canEdit && (
              <Link href={editHref ?? "/paineis"}>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    isDark
                      ? "text-slate-400 hover:text-white"
                      : "text-slate-500 hover:text-teal-700"
                  )}
                >
                  <Pencil size={13} />
                  Editar dashboard
                </Button>
              </Link>
            )}
          </div>
        </header>

        {/* Filters (read-only defaults) */}
        {dashboard.filters.length > 0 && (
          <section
            className={cn(
              "mt-6 rounded-xl border px-4 py-3",
              isDark
                ? "border-slate-800 bg-slate-900"
                : "border-slate-200 bg-white"
            )}
          >
            <div className="flex flex-wrap gap-3">
              {dashboard.filters.map((f) => (
                <div key={f.id} className="text-xs">
                  <span
                    className={cn(
                      "font-medium",
                      isDark ? "text-slate-400" : "text-slate-500"
                    )}
                  >
                    {f.column}
                  </span>
                  <span
                    className={cn(
                      "ml-2",
                      isDark ? "text-slate-200" : "text-slate-800"
                    )}
                  >
                    {Array.isArray(f.defaultValue)
                      ? f.defaultValue.join(", ") || "—"
                      : f.defaultValue || "—"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Grid — no drag/resize, no edit controls */}
        <section className="mt-6">
          <div ref={containerRef}>
            {dashboard.widgets.length === 0 ? (
              <div
                className={cn(
                  "flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center",
                  isDark
                    ? "border-slate-700 bg-slate-900"
                    : "border-slate-300 bg-white"
                )}
              >
                <p
                  className={cn(
                    "text-sm",
                    isDark ? "text-slate-400" : "text-slate-500"
                  )}
                >
                  Este painel ainda não possui gráficos.
                </p>
              </div>
            ) : mounted ? (
              <ResponsiveGridLayout
                className="layout"
                width={width}
                layouts={layouts}
                breakpoints={GRID_BREAKPOINTS}
                cols={GRID_COLS}
                rowHeight={GRID_ROW_HEIGHT}
                margin={GRID_MARGIN}
                dragConfig={{ enabled: false }}
                resizeConfig={{ enabled: false }}
                compactor={verticalCompactor}
              >
                {dashboard.widgets.map((widget) => (
                  <div key={widget.id}>
                    <div className="h-full">
                      <DashboardWidgetView
                        widget={widget}
                        filters={dashboard.filters}
                        filterValues={filterValues}
                        onRemove={() => undefined}
                        readOnly
                        key={`${widget.id}-${refreshKey}`}
                      />
                    </div>
                  </div>
                ))}
              </ResponsiveGridLayout>
            ) : null}
          </div>
        </section>

        {canEdit && (
          <footer
            className={cn(
              "mt-8 flex justify-end",
              isDark ? "text-slate-500" : "text-slate-400"
            )}
          >
            <Link
              href={editHref ?? "/paineis"}
              className="inline-flex items-center gap-1 text-xs hover:text-teal-600"
            >
              <ExternalLink size={12} />
              Abrir no editor
            </Link>
          </footer>
        )}
      </div>

      <ShareDashboardDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        dashboard={dashboard}
      />

      {enableCopilot && (
        <DashboardCopilot
          open={copilotOpen}
          onOpenChange={setCopilotOpen}
          dashboard={dashboard}
          enabled={enableCopilot}
        />
      )}
    </div>
  )
}
