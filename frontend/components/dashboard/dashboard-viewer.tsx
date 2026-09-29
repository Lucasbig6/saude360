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
import { ShareDashboardDialog } from "./share-dashboard-dialog"
import { DashboardCopilot } from "./dashboard-copilot"
import { DashboardCanvas } from "./dashboard-canvas"

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
          <div>
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
            ) : (
              <DashboardCanvas
                dashboard={dashboard}
                readOnly
                filterValues={filterValues}
                refreshKey={refreshKey}
              />
            )}
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
