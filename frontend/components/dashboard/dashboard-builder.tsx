"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Eye,
  Filter,
  Info,
  LayoutGrid,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Share2,
  Sparkles,
  StretchHorizontal,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Dashboard, DashboardAppearance, DashboardFilter, DashboardWidth, DashboardWidget } from "@/lib/types/dashboard"
import type { Analysis } from "@/lib/types/analysis"
import { legacyToWidgetConfig, type WidgetConfig } from "@/lib/types/widgets"
import { updateDashboard, toDashboardPayload } from "@/lib/api/dashboards"
import { getAnalysis } from "@/lib/api/analyses"
import { cn, dashboardWidthClass, getDashboardSharePath } from "@/lib/utils"
import { ApiError } from "@/lib/api"
import { getDistinctValues } from "@/lib/api/datasets"
import { AddAnalysisDialog } from "./add-analysis-dialog"
import { AddFilterDialog } from "./add-filter-dialog"
import { DashboardFiltersBar } from "./dashboard-filters-bar"
import { ShareDashboardDialog } from "./share-dashboard-dialog"
import { EditDashboardInfoDialog } from "./edit-dashboard-info-dialog"
import { DashboardCanvas } from "./dashboard-canvas"
import { WidgetConfigDialog } from "./widget-config-dialog"
import { DashboardComponentsDrawer } from "./dashboard-components-drawer"
import type { CanvasItem, GridDropAnalysisData } from "./gridstack-canvas"

const WIDTH_OPTIONS: {
  value: DashboardWidth
  label: string
  hint: string
}[] = [
  { value: "default", label: "Padrão", hint: "1280px" },
  { value: "wide", label: "Larga", hint: "1536px" },
  { value: "full", label: "Tela cheia", hint: "100%" },
]

interface DashboardBuilderProps {
  dashboard: Dashboard
  onDashboardChange: (dashboard: Dashboard) => void
}

export function DashboardBuilder({
  dashboard,
  onDashboardChange,
}: DashboardBuilderProps) {
  const [editing, setEditing] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [addFilterOpen, setAddFilterOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [configuringWidgetId, setConfiguringWidgetId] = useState<string | null>(
    null
  )
  const [refreshKey, setRefreshKey] = useState(0)

  // Fila de persistência: PUT serializado com o snapshot mais recente.
  //  - latestRef é lido imediatamente antes de cada PUT;
  //  - dirtyRef só é limpo após sucesso (e só se nada mais novo chegou);
  //  - falha não retenta sozinha: o próximo evento do usuário reativa o worker.
  const latestRef = useRef(dashboard)
  const dirtyRef = useRef(false)
  const workingRef = useRef(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const pump = useCallback(async () => {
    if (workingRef.current) return
    workingRef.current = true

    try {
      while (dirtyRef.current) {
        const snapshot = latestRef.current

        try {
          await updateDashboard(snapshot.id, toDashboardPayload(snapshot))
        } catch (err) {
          setSaveError(
            err instanceof ApiError
              ? err.detail
              : "Não foi possível salvar o painel."
          )
          return
        }

        if (latestRef.current === snapshot) {
          dirtyRef.current = false
        }
        setSaveError(null)
      }
    } finally {
      workingRef.current = false
    }
  }, [])

  const persist = useCallback(
    (next: Dashboard) => {
      latestRef.current = next
      dirtyRef.current = true
      onDashboardChange(next)
      void pump()
    },
    [onDashboardChange, pump]
  )

  const [filterValues, setFilterValues] = useState<Record<string, string | string[]>>(
    () => {
      const initial: Record<string, string | string[]> = {}
      for (const f of dashboard.filters) {
        initial[f.id] = f.defaultValue
      }
      return initial
    }
  )

  const [distinctValues, setDistinctValues] = useState<Record<string, string[]>>({})
  const [loadingDistinct, setLoadingDistinct] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => {
      setFilterValues((prev) => {
        const next: Record<string, string | string[]> = {}
        for (const f of dashboard.filters) {
          next[f.id] = prev[f.id] ?? f.defaultValue
        }
        return next
      })
    })
  }, [dashboard.filters])

  useEffect(() => {
    if (dashboard.filters.length === 0) {
      requestAnimationFrame(() => setDistinctValues({}))
      return
    }

    let cancelled = false
    async function load() {
      setLoadingDistinct(true)
      const newDistinct: Record<string, string[]> = {}

      for (const f of dashboard.filters) {
        if (newDistinct[f.id]) continue
        try {
          const res = await getDistinctValues(f.datasetId, f.column)
          if (!cancelled) {
            newDistinct[f.id] = res.result ?? []
          }
        } catch {
          if (!cancelled) {
            newDistinct[f.id] = []
          }
        }
      }

      if (!cancelled) {
        setDistinctValues((prev) => ({ ...prev, ...newDistinct }))
        setLoadingDistinct(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [dashboard.filters])

  const handleLayoutChange = useCallback(
    (layout: CanvasItem[]) => {
      const layoutById = new Map(layout.map((item) => [item.id, item]))
      let changed = false

      const updatedWidgets = dashboard.widgets.map((w) => {
        const next = layoutById.get(w.id)
        if (!next) return w
        if (
          w.layout.x === next.x &&
          w.layout.y === next.y &&
          w.layout.w === next.w &&
          w.layout.h === next.h
        ) {
          return w
        }
        changed = true
        return {
          ...w,
          layout: { x: next.x, y: next.y, w: next.w, h: next.h },
        }
      })

      if (!changed) return
      persist({ ...dashboard, widgets: updatedWidgets })
    },
    [dashboard, persist]
  )

  const handleAddAnalysis = useCallback(
    (
      analysis: Analysis,
      position?: { x?: number; y?: number; w?: number; h?: number }
    ) => {
      // anexa na primeira linha livre quando nenhuma coordenada for especificada
      const appendY = dashboard.widgets.reduce(
        (max, w) => Math.max(max, w.layout.y + w.layout.h),
        0
      )
      const newWidget: DashboardWidget = {
        id: crypto.randomUUID(),
        analysisId: analysis.id,
        layout: {
          x: position?.x ?? 0,
          y: position?.y !== undefined ? position.y : appendY,
          w: position?.w ?? 6,
          h: position?.h ?? 4,
        },
        config: legacyToWidgetConfig(analysis),
      }

      const updated = {
        ...dashboard,
        widgets: [...dashboard.widgets, newWidget],
      }

      persist(updated)
    },
    [dashboard, persist]
  )

  const handleDropAnalysis = useCallback(
    async (data: GridDropAnalysisData) => {
      try {
        const analysis = await getAnalysis(data.analysisId)
        if (analysis) {
          handleAddAnalysis(analysis, {
            x: data.x,
            y: data.y,
            w: data.w,
            h: data.h,
          })
        }
      } catch {
        setSaveError("Não foi possível carregar o gráfico solto no painel.")
      }
    },
    [handleAddAnalysis]
  )

  const handleRemoveWidget = useCallback(
    (widgetId: string) => {
      const updated = {
        ...dashboard,
        widgets: dashboard.widgets.filter((w) => w.id !== widgetId),
      }

      persist(updated)
    },
    [dashboard, persist]
  )

  const handleConfigure = useCallback((widgetId: string) => {
    setConfiguringWidgetId(widgetId)
  }, [])

  const handleConfigSave = useCallback(
    (widgetId: string, config: WidgetConfig) => {
      setConfiguringWidgetId(null)

      const updated = {
        ...dashboard,
        widgets: dashboard.widgets.map((w) =>
          w.id === widgetId ? { ...w, config } : w
        ),
      }

      persist(updated)
    },
    [dashboard, persist]
  )

  const handleAddFilter = useCallback(
    (filterData: Omit<DashboardFilter, "id">) => {
      const newFilter: DashboardFilter = {
        ...filterData,
        id: crypto.randomUUID(),
      }

      const updated = {
        ...dashboard,
        filters: [...dashboard.filters, newFilter],
      }

      persist(updated)

      setFilterValues((prev) => ({
        ...prev,
        [newFilter.id]: newFilter.defaultValue,
      }))

      setLoadingDistinct(true)
      getDistinctValues(newFilter.datasetId, newFilter.column)
        .then((res) => {
          setDistinctValues((prev) => ({
            ...prev,
            [newFilter.id]: res.result ?? [],
          }))
        })
        .catch(() => {
          setDistinctValues((prev) => ({ ...prev, [newFilter.id]: [] }))
        })
        .finally(() => setLoadingDistinct(false))
    },
    [dashboard, persist]
  )

  const handleRemoveFilter = useCallback(
    (filterId: string) => {
      const updated = {
        ...dashboard,
        filters: dashboard.filters.filter((f) => f.id !== filterId),
      }

      persist(updated)

      setFilterValues((prev) => {
        const next = { ...prev }
        delete next[filterId]
        return next
      })
      setDistinctValues((prev) => {
        const next = { ...prev }
        delete next[filterId]
        return next
      })
    },
    [dashboard, persist]
  )

  const handleFilterValueChange = useCallback(
    (filterId: string, value: string | string[]) => {
      setFilterValues((prev) => ({ ...prev, [filterId]: value }))
    },
    []
  )

  const handleRefreshAll = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  const excludeAnalysisIds = useMemo(
    () => dashboard.widgets.map((w) => w.analysisId),
    [dashboard.widgets]
  )

  const viewerHref = getDashboardSharePath(dashboard)

  function handleSaveInfo(data: {
    name: string
    description: string
    appearance: DashboardAppearance
  }) {
    const updated: Dashboard = {
      ...dashboard,
      name: data.name,
      description: data.description,
      appearance: data.appearance,
    }
    persist(updated)
  }

  // Largura do painel: salva imediatamente (fila de PUT) e aplica na hora,
  // porque o container lê dashboard.appearance.
  function handleWidthChange(width: DashboardWidth) {
    if ((dashboard.appearance?.width ?? "default") === width) return
    persist({ ...dashboard, appearance: { ...dashboard.appearance, width } })
  }

  return (
    <div
      className={cn(
        dashboardWidthClass(dashboard.appearance),
        "px-4 sm:px-6 lg:px-8 py-8 transition-all duration-300",
        editing && drawerOpen && "xl:pr-[440px]"
      )}
    >
      {/* Navigation */}
      <Link
        href="/paineis"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-600 transition-colors"
      >
        <ArrowLeft size={14} />
        Painéis
      </Link>

      {/* Header */}
      <section className="mt-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {dashboard.name}
            </h1>
            {dashboard.description && (
              <p className="mt-1 text-sm text-slate-500">
                {dashboard.description}
              </p>
            )}
            {dashboard.slug && (
              <p className="mt-1 text-xs text-slate-400">
                /painel/{dashboard.slug}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshAll}
              title="Atualizar dados de todos os widgets"
            >
              <RefreshCw size={14} />
              <span className="hidden sm:inline">Atualizar dados</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setInfoOpen(true)}
              title="Editar informações"
            >
              <Info size={14} />
              <span className="hidden sm:inline">Informações</span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    title={`Largura do painel: ${
                      WIDTH_OPTIONS.find(
                        (option) =>
                          option.value === (dashboard.appearance?.width ?? "default")
                      )?.label
                    }`}
                  />
                }
              >
                <StretchHorizontal size={14} />
                <span className="hidden sm:inline">Largura</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {WIDTH_OPTIONS.map((option) => {
                  const active =
                    (dashboard.appearance?.width ?? "default") === option.value
                  return (
                    <DropdownMenuItem
                      key={option.value}
                      onClick={() => handleWidthChange(option.value)}
                    >
                      <span className="flex-1">{option.label}</span>
                      <span className="text-xs text-slate-400">{option.hint}</span>
                      {active && <Check size={14} className="text-teal-600" />}
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShareOpen(true)}
              title="Compartilhar"
            >
              <Share2 size={14} />
              <span className="hidden sm:inline">Compartilhar</span>
            </Button>

            <Link href={viewerHref}>
              <Button variant="outline" size="sm" title="Visualizar">
                <Eye size={14} />
                Visualizar
              </Button>
            </Link>

            {editing ? (
              <>
                <Button
                  variant={drawerOpen ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDrawerOpen((prev) => !prev)}
                  className={
                    drawerOpen
                      ? "bg-slate-900 text-white hover:bg-slate-800"
                      : ""
                  }
                  title="Abrir/fechar biblioteca de gráficos para arrastar e soltar"
                >
                  <LayoutGrid size={14} />
                  <span className="hidden sm:inline">Biblioteca de gráficos</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAddDialogOpen(true)}
                  title="Buscar e adicionar gráfico por lista"
                >
                  <Plus size={14} />
                  <span className="hidden sm:inline">Adicionar por lista</span>
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setEditing(false)
                    setDrawerOpen(false)
                  }}
                  className="bg-teal-600 text-white hover:bg-teal-700"
                >
                  <Save size={14} />
                  Concluir edição
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(true)
                  setDrawerOpen(true)
                }}
                className="bg-teal-600 text-white hover:bg-teal-700"
              >
                <Pencil size={14} />
                Editar
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Save error — sem retry automático: a próxima ação reenvia */}
      {saveError && (
        <section className="mt-4">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            <AlertCircle size={16} className="shrink-0" />
            <span className="min-w-0 flex-1">{saveError}</span>
            <span className="text-xs text-red-500">
              Não foi possível persistir. A próxima alteração reenvia o painel.
            </span>
          </div>
        </section>
      )}

      {/* Filters */}
      {(dashboard.filters.length > 0 || editing) && (
        <section className="mt-4">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex items-center gap-2">
              <Filter size={14} className="text-slate-500" />
              <span className="text-xs font-medium text-slate-500">
                Filtros
              </span>
            </div>
            <div className="mt-2">
              <DashboardFiltersBar
                filters={dashboard.filters}
                editing={editing}
                filterValues={filterValues}
                loadingDistinct={loadingDistinct}
                distinctValues={distinctValues}
                onAdd={() => setAddFilterOpen(true)}
                onRemove={handleRemoveFilter}
                onValueChange={handleFilterValueChange}
              />
            </div>
          </div>
        </section>
      )}

      {/* Grid */}
      <section className="mt-6">
        <div
          className={editing && dashboard.widgets.length > 0 ? "dashboard-edit-grid" : ""}
        >
          {dashboard.widgets.length === 0 ? (
            <div
              className={cn(
                "flex flex-col items-center justify-center rounded-xl border p-12 text-center transition-colors",
                editing
                  ? "border-dashed border-teal-300 bg-teal-50/30"
                  : "border-dashed border-slate-300 bg-white"
              )}
            >
              <div
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-full",
                  editing
                    ? "bg-teal-100 text-teal-700"
                    : "bg-slate-100 text-slate-400"
                )}
              >
                {editing ? <Sparkles size={24} /> : <Plus size={24} />}
              </div>
              <h2 className="mt-4 text-base font-semibold text-slate-900">
                {editing
                  ? "Prancheta pronta para montagem"
                  : "Nenhum widget adicionado"}
              </h2>
              <p className="mt-1 max-w-md text-sm text-slate-500">
                {editing
                  ? "Arraste qualquer gráfico da biblioteca lateral diretamente para esta área, ou utilize os botões abaixo para montar seu painel."
                  : "Adicione gráficos e análises salvos para visualizar seus dados neste painel."}
              </p>
              <div className="mt-6 flex flex-wrap gap-2.5 justify-center">
                {editing && (
                  <Button
                    onClick={() => setDrawerOpen(true)}
                    className="bg-slate-900 text-white hover:bg-slate-800"
                  >
                    <LayoutGrid size={15} />
                    Abrir biblioteca lateral
                  </Button>
                )}
                <Button
                  onClick={() => setAddDialogOpen(true)}
                  className="bg-teal-600 text-white hover:bg-teal-700"
                >
                  <Plus size={16} />
                  Adicionar por lista
                </Button>
              </div>
            </div>
          ) : (
            <DashboardCanvas
              dashboard={dashboard}
              editing={editing}
              filterValues={filterValues}
              refreshKey={refreshKey}
              onRemoveWidget={handleRemoveWidget}
              onConfigure={handleConfigure}
              onLayoutChange={handleLayoutChange}
              onDropAnalysis={handleDropAnalysis}
            />
          )}
        </div>
      </section>

      {/* Add Analysis Dialog */}
      <AddAnalysisDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSelect={handleAddAnalysis}
        excludeIds={excludeAnalysisIds}
      />

      {/* Add Filter Dialog */}
      <AddFilterDialog
        open={addFilterOpen}
        onOpenChange={setAddFilterOpen}
        onAdd={handleAddFilter}
        existingFilters={dashboard.filters}
        dashboardWidgetAnalysisIds={dashboard.widgets.map((w) => w.analysisId)}
      />

      {/* Share */}
      <ShareDashboardDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        dashboard={dashboard}
      />

      {/* Edit info / appearance */}
      <EditDashboardInfoDialog
        open={infoOpen}
        onOpenChange={setInfoOpen}
        dashboard={dashboard}
        onSave={handleSaveInfo}
      />

      {/* Widget config */}
      <WidgetConfigDialog
        widget={
          dashboard.widgets.find((w) => w.id === configuringWidgetId) ?? null
        }
        onOpenChange={(open) => {
          if (!open) setConfiguringWidgetId(null)
        }}
        onSave={handleConfigSave}
      />

      {/* Drawer lateral de gráficos prontos para arrastar e soltar estilo Metabase/Superset */}
      {editing && drawerOpen && (
        <div className="fixed inset-y-0 right-0 top-20 z-40 flex">
          <DashboardComponentsDrawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            onSelectAnalysis={(analysis, pos) => handleAddAnalysis(analysis, pos)}
            existingAnalysisIds={excludeAnalysisIds}
          />
        </div>
      )}
    </div>
  )
}
