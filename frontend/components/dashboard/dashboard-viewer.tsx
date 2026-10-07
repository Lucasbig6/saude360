"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import {
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
        isDark ? "dark bg-background text-foreground" : "bg-muted/50 text-foreground"
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
              <div className="mb-3">
                <Image
                  src="/Logo principal.svg"
                  alt="SIGDATA"
                  width={283}
                  height={90}
                  className="h-auto w-[124px]"
                />
              </div>
            )}

            <h1
              className={cn(
                "text-2xl font-semibold text-inherit",
                "text-foreground"
              )}
            >
              {dashboard.name}
            </h1>
            {dashboard.description && (
              <p
                className={cn(
                  "mt-1 max-w-2xl text-sm",
                  "text-muted-foreground"
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
                    ? "border-border bg-card text-foreground hover:bg-muted"
                    : "border-primary/25 bg-primary/10 text-primary hover:bg-primary/15"
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
                  ? "border-border bg-card text-foreground hover:bg-muted"
                  : "bg-card"
              )}
              title="Atualizar dados"
            >
              <RefreshCw size={14} />
              Atualizar
            </Button>

            <Button
              size="sm"
              onClick={() => setShareOpen(true)}
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
                      ? "text-muted-foreground hover:text-primary-foreground"
                      : "text-muted-foreground hover:text-primary"
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
              "mt-6 rounded-lg border px-4 py-3",
              isDark
                ? "border-border bg-card"
                : "border-border bg-card"
            )}
          >
            <div className="flex flex-wrap gap-3">
              {dashboard.filters.map((f) => (
                <div key={f.id} className="text-xs">
                  <span
                    className={cn(
                      "font-medium",
                      "text-muted-foreground"
                    )}
                  >
                    {f.column}
                  </span>
                  <span
                    className={cn(
                      "ml-2",
                      "text-foreground"
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
                  "flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center",
                  isDark
                    ? "border-border bg-card"
                    : "border-border bg-card"
                )}
              >
                <p
                  className={cn(
                    "text-sm",
                    "text-muted-foreground"
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
              "text-muted-foreground"
            )}
          >
            <Link
              href={editHref ?? "/paineis"}
              className="inline-flex items-center gap-1 text-xs hover:text-primary"
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
