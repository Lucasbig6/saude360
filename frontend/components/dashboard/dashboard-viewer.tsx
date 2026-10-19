"use client"

import { useCallback, useEffect, useState } from "react"
import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Dashboard } from "@/lib/types/dashboard"
import { getDistinctValues } from "@/lib/api/datasets"
import { resolveActivePageId, widgetsForPage } from "@/lib/dashboard-pages"
import { ShareDashboardDialog } from "./share-dashboard-dialog"
import { DashboardCopilot } from "./dashboard-copilot"
import { DashboardCanvas } from "./dashboard-canvas"
import { DashboardFooter } from "./dashboard-footer"

interface DashboardViewerProps {
  dashboard: Dashboard
  /** When true, shows a discreet link back to the editor (authenticated context). */
  canEdit?: boolean
  /** Quando true, usa endpoints públicos (sem auth) para buscar dados dos widgets. */
  publicMode?: boolean
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
  publicMode = false,
  editHref,
  enableCopilot = false,
}: DashboardViewerProps) {
  const [shareOpen, setShareOpen] = useState(false)
  const [copilotOpen, setCopilotOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  // Página ativa é local ao visualizador: trocar de aba no link compartilhado
  // não persiste nada no servidor (não altera permissões nem compartilhamento).
  const [activePageId, setActivePageId] = useState(() =>
    resolveActivePageId(dashboard)
  )
  const [filterValues, setFilterValues] = useState<
    Record<string, string | string[]>
  >(() => {
    const initial: Record<string, string | string[]> = {}
    for (const f of dashboard.filters) {
      initial[f.id] = f.defaultValue
    }
    return initial
  })
  const [distinctValues, setDistinctValues] = useState<Record<string, string[]>>({})
  const [loadingDistinct, setLoadingDistinct] = useState(false)

  const isDark = dashboard.appearance?.theme === "dark"
  const showBrand = dashboard.appearance?.showBrand !== false

  // Valores distintos alimentam os selects dos filtros, mas o endpoint é
  // autenticado: no modo público (anônimo) nunca é chamado — os controles
  // usam os inputs livres como fallback e nenhuma requisição exige login.
  // O viewer monta com o dashboard já carregado (filtros fixos durante a
  // sessão), então o estado inicial dos valores já está correto.
  useEffect(() => {
    if (publicMode || dashboard.filters.length === 0) return

    let cancelled = false
    async function load() {
      setLoadingDistinct(true)
      const next: Record<string, string[]> = {}
      for (const f of dashboard.filters) {
        try {
          const res = await getDistinctValues(f.datasetId, f.column)
          if (!cancelled) next[f.id] = res.result ?? []
        } catch {
          if (!cancelled) next[f.id] = []
        }
      }
      if (!cancelled) {
        setDistinctValues(next)
        setLoadingDistinct(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [dashboard.filters, publicMode])

  const handleFilterValueChange = useCallback(
    (filterId: string, value: string | string[]) => {
      setFilterValues((prev) => ({ ...prev, [filterId]: value }))
    },
    []
  )

  // Valida a página ativa contra as páginas atuais (fallback: primeira).
  const effectivePageId = resolveActivePageId({
    ...dashboard,
    activePageId,
  })
  const pageWidgets = widgetsForPage(dashboard.widgets, effectivePageId)

  return (
    <div
      className={cn(
        "flex h-dvh flex-col overflow-hidden",
        isDark ? "dark bg-background text-foreground" : "bg-muted/50 text-foreground"
      )}
    >
      {/* Área de visualização: rola acima da footer */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin">
        <div
          className={cn(
            enableCopilot
              ? "px-4 sm:px-6 lg:px-8 py-6 sm:py-8"
              : "p-2 sm:p-3",
            "transition-[padding-right] duration-200",
            copilotOpen && "lg:pr-[24rem] xl:pr-[26rem]"
          )}
        >
          {/* Cabeçalho de apresentação só quando o copiloto está habilitado
              (viewer autenticado). Na página compartilhada o canvas é a
              página inteira — padrão Power BI — e a footer fica abaixo. */}
          {enableCopilot && (
            <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
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
              </div>
            </header>
          )}

          {/* Grid — no drag/resize, no edit controls */}
          <section className={enableCopilot ? "mt-6" : undefined}>
            <div>
              {pageWidgets.length === 0 ? (
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
                    Esta página ainda não possui gráficos.
                  </p>
                </div>
              ) : (
                <DashboardCanvas
                  key={effectivePageId}
                  dashboard={{ ...dashboard, widgets: pageWidgets }}
                  readOnly
                  filterValues={filterValues}
                  distinctValues={distinctValues}
                  loadingDistinct={loadingDistinct}
                  onFilterValueChange={handleFilterValueChange}
                  refreshKey={refreshKey}
                  publicMode={publicMode}
                />
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Footer fixa na base da área de visualização (no fluxo, sem sobrepor) */}
      <DashboardFooter
        pages={dashboard.pages}
        activePageId={effectivePageId}
        onSelectPage={setActivePageId}
        showBrand={showBrand}
        canEdit={canEdit}
        editHref={editHref}
        onUpdate={() => setRefreshKey((k) => k + 1)}
        onShare={() => setShareOpen(true)}
        className={copilotOpen ? "lg:pr-[24rem] xl:pr-[26rem]" : undefined}
      />

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
