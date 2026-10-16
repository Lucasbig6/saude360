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
import type { Dashboard, DashboardAppearance, DashboardFilter, DashboardPage, DashboardWidth, DashboardWidget } from "@/lib/types/dashboard"
import type { Analysis } from "@/lib/types/analysis"
import { legacyToWidgetConfig, type WidgetConfig } from "@/lib/types/widgets"
import {
  bringToFront,
  copyWidgetPayload,
  duplicateWidget,
  isEditorShortcutTargetIgnored,
  pasteWidgetPayload,
  sendToBack,
  type CopiedWidgetPayload,
} from "@/lib/dashboard-elements"
import { updateDashboard, toDashboardPayload } from "@/lib/api/dashboards"
import {
  addPage,
  deletePage,
  movePage,
  renamePage,
  resolveActivePageId,
  widgetsForPage,
} from "@/lib/dashboard-pages"
import { getAnalysis } from "@/lib/api/analyses"
import { getProject } from "@/lib/api/projects"
import { cn, dashboardWidthClass, getDashboardSharePath } from "@/lib/utils"
import { ApiError } from "@/lib/api"
import { getDistinctValues } from "@/lib/api/datasets"
import { AddAnalysisDialog } from "./add-analysis-dialog"
import { AddFilterDialog } from "./add-filter-dialog"
import { DashboardFiltersBar } from "./dashboard-filters-bar"
import { ShareDashboardDialog } from "./share-dashboard-dialog"
import { EditDashboardInfoDialog } from "./edit-dashboard-info-dialog"
import { DashboardCanvas } from "./dashboard-canvas"
import { DashboardPageBar } from "./dashboard-page-bar"
import { DeleteConfirmationDialog } from "@/components/shared/delete-confirmation-dialog"
import { WidgetConfigDialog } from "./widget-config-dialog"
import { DashboardComponentsDrawer } from "./dashboard-components-drawer"
import { DashboardPropertiesPanel } from "./dashboard-properties-panel"
import type { FilterControlType } from "@/lib/types/dashboard"
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
  // Etapa C: aba ativa da lateral (biblioteca | propriedades). A troca de
  // aba nunca desmonta a biblioteca: busca e categoria são preservadas.
  const [drawerTab, setDrawerTab] = useState<"library" | "props">("library")
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [addFilterOpen, setAddFilterOpen] = useState(false)
  // Etapa B: controle pré-selecionado ao abrir o diálogo pela biblioteca.
  const [filterPreset, setFilterPreset] = useState<FilterControlType>("dropdown")
  const [shareOpen, setShareOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [configuringWidgetId, setConfiguringWidgetId] = useState<string | null>(
    null
  )
  // Etapa A: seleção visual do elemento ativo (estado local, não persistido).
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null)
  // Área de transferência intra-sessão (memória; nunca fonte de verdade).
  const clipboardRef = useRef<CopiedWidgetPayload | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [pagePendingDelete, setPagePendingDelete] = useState<DashboardPage | null>(
    null
  )

  // Fila de persistência: PUT serializado com o snapshot mais recente.
  //  - latestRef é lido imediatamente antes de cada PUT;
  //  - dirtyRef só é limpo após sucesso (e só se nada mais novo chegou);
  //  - falha não retenta sozinha: o próximo evento do usuário reativa o worker.
  const latestRef = useRef(dashboard)
  const dirtyRef = useRef(false)
  const workingRef = useRef(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Nome do projeto do painel (exibido na biblioteca de gráficos).
  // Padrão de chave derivada: "sem resultado para a chave atual" = carregando.
  const projectKey = dashboard.projectId ?? "*"
  const [projectLoad, setProjectLoad] = useState<{
    key: string
    name: string | null
  } | null>(null)
  useEffect(() => {
    const projectId = dashboard.projectId
    if (!projectId) return
    let cancelled = false
    getProject(projectId)
      .then((project) => {
        if (!cancelled) {
          setProjectLoad({ key: projectId, name: project?.name ?? null })
        }
      })
      .catch(() => {
        if (!cancelled) setProjectLoad({ key: projectId, name: null })
      })
    return () => {
      cancelled = true
    }
  }, [dashboard.projectId])

  const projectName =
    projectLoad?.key === projectKey ? projectLoad.name : null

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
      const pageId = resolveActivePageId(latestRef.current)
      const pageWidgets = widgetsForPage(latestRef.current.widgets, pageId)

      // mesmo gráfico pode existir em páginas diferentes (uma por página)
      if (pageWidgets.some((widget) => widget.analysisId === analysis.id)) {
        return
      }

      // anexa na primeira linha livre da PÁGINA quando não houver coordenada
      const appendY = pageWidgets.reduce(
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
        pageId,
      }

      const updated = {
        ...latestRef.current,
        widgets: [...latestRef.current.widgets, newWidget],
      }

      persist(updated)
    },
    [persist]
  )

  const handleAddElement = useCallback(
    (
      config: WidgetConfig,
      position?: { x?: number; y?: number; w?: number; h?: number }
    ) => {
      const current = latestRef.current
      const pageId = resolveActivePageId(current)
      const pageWidgets = widgetsForPage(current.widgets, pageId)
      const appendY = pageWidgets.reduce(
        (max, widget) => Math.max(max, widget.layout.y + widget.layout.h),
        0
      )
      const widget: DashboardWidget = {
        id: crypto.randomUUID(),
        analysisId: null,
        config,
        layout: {
          x: position?.x ?? 0,
          y: position?.y ?? appendY,
          w: position?.w ?? (config.type === "filter" ? 4 : 4),
          h: position?.h ?? (config.type === "text" ? 2 : 3),
        },
        pageId,
      }
      persist({ ...current, widgets: [...current.widgets, widget] })
    },
    [persist]
  )

  const handleDropAnalysis = useCallback(
    async (data: GridDropAnalysisData) => {
      if (data.config) {
        handleAddElement(data.config, data)
        return
      }
      if (!data.analysisId) return
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
    [handleAddAnalysis, handleAddElement]
  )

  const handleEmptyCanvasDragOver = useCallback((event: React.DragEvent) => {
    if (!event.dataTransfer) return
    if (
      event.dataTransfer.types.includes("application/json") ||
      event.dataTransfer.types.includes("text/plain")
    ) {
      event.preventDefault()
      event.dataTransfer.dropEffect = "copy"
    }
  }, [])

  const handleEmptyCanvasDrop = useCallback(
    (event: React.DragEvent) => {
      const dataTransfer = event.dataTransfer
      if (!dataTransfer) return

      let analysisId = dataTransfer.getData("text/plain")
      const json = dataTransfer.getData("application/json")
      let config: WidgetConfig | undefined
      if (json) {
        try {
          const parsed = JSON.parse(json)
          analysisId = parsed?.analysisId ?? analysisId
          config = parsed?.config
        } catch {
          // Mantém o id do formato text/plain como fallback.
        }
      }

      if (!analysisId && !config) return
      event.preventDefault()
      void handleDropAnalysis({
        ...(analysisId ? { analysisId } : {}),
        ...(config ? { config } : {}),
        x: 0,
        y: 0,
        w: config ? 4 : 6,
        h: config ? 3 : 4,
      })
    },
    [handleDropAnalysis]
  )

  const handleRemoveWidget = useCallback(
    (widgetId: string) => {
      const updated = {
        ...dashboard,
        widgets: dashboard.widgets.filter((w) => w.id !== widgetId),
      }

      persist(updated)
      setSelectedWidgetId((prev) => (prev === widgetId ? null : prev))
    },
    [dashboard, persist]
  )

  const handleSelectWidget = useCallback((widgetId: string | null) => {
    setSelectedWidgetId(widgetId)
    // A aba de propriedades passa a refletir a seleção; a biblioteca
    // continua montada (oculta) com busca e categoria preservadas.
    if (widgetId !== null) {
      setDrawerTab("props")
    }
  }, [])

  function handleToggleDrawer() {
    if (!drawerOpen) {
      // Sem seleção, a lateral sempre abre na biblioteca.
      setDrawerTab(selectedWidgetId !== null ? "props" : "library")
    }
    setDrawerOpen((open) => !open)
  }

  const handleOpenAddFilter = useCallback((preset: FilterControlType = "dropdown") => {
    setFilterPreset(preset)
    setAddFilterOpen(true)
  }, [])

  const handleSaveWidgetLayout = useCallback(
    (widgetId: string, layout: DashboardWidget["layout"]) => {
      const current = latestRef.current
      if (!current.widgets.some((w) => w.id === widgetId)) return
      const next = current.widgets.map((w) =>
        w.id === widgetId ? { ...w, layout } : w
      )
      persist({ ...current, widgets: next })
    },
    [persist]
  )

  const handleSaveWidgetConfig = useCallback(
    (widgetId: string, config: WidgetConfig) => {
      const current = latestRef.current
      if (!current.widgets.some((w) => w.id === widgetId)) return
      const next = current.widgets.map((w) =>
        w.id === widgetId ? { ...w, config } : w
      )
      persist({ ...current, widgets: next })
    },
    [persist]
  )

  const handleSaveFilter = useCallback(
    (filterId: string, patch: Partial<DashboardFilter>) => {
      const current = latestRef.current
      const target = current.filters.find((f) => f.id === filterId)
      if (!target) return
      const next = { ...target, ...patch }
      persist({
        ...current,
        filters: current.filters.map((f) => (f.id === filterId ? next : f)),
      })
      // Espelha o padrão no valor em edição para pré-visualizar na hora.
      if (patch.defaultValue !== undefined) {
        setFilterValues((prev) => ({ ...prev, [filterId]: next.defaultValue }))
      }
    },
    [persist]
  )

  const handleClearFilterValue = useCallback((filterId: string) => {
    const target = latestRef.current.filters.find((f) => f.id === filterId)
    if (!target) return
    const empty =
      target.operator === "in" || target.operator === "between" ? [] : ""
    setFilterValues((prev) => ({ ...prev, [filterId]: empty }))
  }, [])

  const handleDuplicateWidget = useCallback(
    (widgetId: string) => {
      const current = latestRef.current
      const source = current.widgets.find((w) => w.id === widgetId)
      if (!source) return
      const copy = duplicateWidget(source)
      persist({ ...current, widgets: [...current.widgets, copy] })
      setSelectedWidgetId(copy.id)
    },
    [persist]
  )

  const handleCopyWidget = useCallback((widgetId: string) => {
    const source = latestRef.current.widgets.find((w) => w.id === widgetId)
    if (!source) return
    clipboardRef.current = copyWidgetPayload(source)
    setSelectedWidgetId(widgetId)
  }, [])

  const handlePasteWidget = useCallback(() => {
    const payload = clipboardRef.current
    if (!payload) return
    const current = latestRef.current
    const pageId = resolveActivePageId(current)
    const pasted = pasteWidgetPayload(payload, pageId)
    persist({ ...current, widgets: [...current.widgets, pasted] })
    setSelectedWidgetId(pasted.id)
  }, [persist])

  const handleBringToFront = useCallback(
    (widgetId: string) => {
      const current = latestRef.current
      if (!current.widgets.some((w) => w.id === widgetId)) return
      persist({ ...current, widgets: bringToFront(current.widgets, widgetId) })
    },
    [persist]
  )

  const handleSendToBack = useCallback(
    (widgetId: string) => {
      const current = latestRef.current
      if (!current.widgets.some((w) => w.id === widgetId)) return
      persist({ ...current, widgets: sendToBack(current.widgets, widgetId) })
    },
    [persist]
  )

  // Atalhos ativos somente no modo de edição, sem dialog aberto e sem foco
  // em campos editáveis. preventDefault só quando a ação for aplicável —
  // nunca intercepta atalhos do navegador à toa.
  const anyDialogOpen =
    addDialogOpen ||
    addFilterOpen ||
    shareOpen ||
    infoOpen ||
    configuringWidgetId !== null ||
    pagePendingDelete !== null

  useEffect(() => {
    if (!editing || anyDialogOpen) return

    function onKeyDown(event: KeyboardEvent) {
      if (isEditorShortcutTargetIgnored(event.target)) return
      const selected = selectedWidgetId
      const mod = event.ctrlKey || event.metaKey

      if (event.key === "Escape") {
        if (selected !== null) {
          event.preventDefault()
          setSelectedWidgetId(null)
        }
        return
      }

      if ((event.key === "Delete" || event.key === "Backspace") && selected !== null) {
        event.preventDefault()
        handleRemoveWidget(selected)
        return
      }

      if (!mod) return
      const key = event.key.toLowerCase()

      if (key === "d" && selected !== null) {
        event.preventDefault()
        handleDuplicateWidget(selected)
      } else if (key === "c" && selected !== null) {
        event.preventDefault()
        handleCopyWidget(selected)
      } else if (key === "v" && clipboardRef.current !== null) {
        event.preventDefault()
        handlePasteWidget()
      } else if (event.key === "]" && selected !== null) {
        event.preventDefault()
        handleBringToFront(selected)
      } else if (event.key === "[" && selected !== null) {
        event.preventDefault()
        handleSendToBack(selected)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [
    editing,
    anyDialogOpen,
    selectedWidgetId,
    handleRemoveWidget,
    handleDuplicateWidget,
    handleCopyWidget,
    handlePasteWidget,
    handleBringToFront,
    handleSendToBack,
  ])

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

      const current = latestRef.current
      const pageId = resolveActivePageId(current)
      const pageWidgets = widgetsForPage(current.widgets, pageId)
      const appendY = pageWidgets.reduce(
        (max, widget) => Math.max(max, widget.layout.y + widget.layout.h),
        0
      )
      const filterWidget: DashboardWidget = {
        id: crypto.randomUUID(),
        analysisId: null,
        config: { type: "filter", filterId: newFilter.id, title: newFilter.column },
        layout: { x: 0, y: appendY, w: 4, h: 2 },
        pageId,
      }
      const updated = {
        ...current,
        widgets: [...current.widgets, filterWidget],
        filters: [...current.filters, newFilter],
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
    [persist]
  )

  const handleRemoveFilter = useCallback(
    (filterId: string) => {
      const current = latestRef.current
      const updated = {
        ...current,
        filters: current.filters.filter((f) => f.id !== filterId),
        widgets: current.widgets.filter((widget) =>
          !(widget.config?.type === "filter" && widget.config.filterId === filterId)
        ),
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
    [persist]
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

  const activePageId = resolveActivePageId(dashboard)
  const pageWidgets = widgetsForPage(dashboard.widgets, activePageId)

  // Escopo por página: a biblioteca só esconde análises já usadas na aba atual.
  const excludeAnalysisIds = useMemo(
    () => pageWidgets.flatMap((widget) => widget.analysisId ? [widget.analysisId] : []),
    [pageWidgets]
  )

  // Etapa C: widget selecionado sempre resolvido na página ativa — nunca se
  // edita acidentalmente um widget da página anterior.
  const selectedWidget = useMemo(
    () => pageWidgets.find((w) => w.id === selectedWidgetId) ?? null,
    [pageWidgets, selectedWidgetId]
  )

  const dashboardAnalysisIds = useMemo(
    () => dashboard.widgets.flatMap((w) => (w.analysisId ? [w.analysisId] : [])),
    [dashboard.widgets]
  )

  const selectedFilterLinkedCards = useMemo(() => {
    if (selectedWidget?.config?.type !== "filter") return 0
    const filterId = selectedWidget.config.filterId
    return dashboard.widgets.filter(
      (w) => w.config?.type === "filter" && w.config.filterId === filterId
    ).length
  }, [dashboard.widgets, selectedWidget])

  const viewerHref = getDashboardSharePath(dashboard)

  // Barra de páginas (persiste a troca: a página ativa é parte do painel).
  function handleSelectPage(pageId: string) {
    if (pageId === activePageId) return
    setSelectedWidgetId(null)
    persist({ ...dashboard, activePageId: pageId })
  }

  function handleAddPage() {
    persist(addPage(dashboard))
  }

  function handleRenamePage(pageId: string, name: string) {
    persist(renamePage(dashboard, pageId, name))
  }

  function handleMovePage(pageId: string, direction: "left" | "right") {
    persist(movePage(dashboard, pageId, direction))
  }

  function handleConfirmDeletePage() {
    if (!pagePendingDelete) return
    const pageId = pagePendingDelete.id
    setPagePendingDelete(null)
    persist(deletePage(dashboard, pageId))
  }

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
        "px-4 sm:px-6 lg:px-8 pt-8 pb-20 transition-all duration-300",
        editing && drawerOpen && "xl:pr-[440px]"
      )}
    >
      {/* Navigation */}
      <Link
        href={
          dashboard.projectId
            ? `/projetos/${dashboard.projectId}/paineis`
            : "/paineis"
        }
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
      >
        <ArrowLeft size={14} />
        Painéis
      </Link>

      {/* Header */}
      <section className="mt-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {dashboard.name}
            </h1>
            {dashboard.description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {dashboard.description}
              </p>
            )}
            {dashboard.slug && (
              <p className="mt-1 text-xs text-muted-foreground">
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
                      <span className="text-xs text-muted-foreground">{option.hint}</span>
                      {active && <Check size={14} className="text-primary" />}
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
                  onClick={handleToggleDrawer}
                  className={
                    drawerOpen
                      ? "bg-primary text-primary-foreground"
                      : ""
                  }
                  title="Abrir/fechar biblioteca de elementos e propriedades"
                >
                  <LayoutGrid size={14} />
                  <span className="hidden sm:inline">Elementos</span>
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
                    setSelectedWidgetId(null)
                  }}
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
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle size={16} className="shrink-0" />
            <span className="min-w-0 flex-1">{saveError}</span>
            <span className="text-xs text-destructive">
              Não foi possível persistir. A próxima alteração reenvia o painel.
            </span>
          </div>
        </section>
      )}

      {/* Filters */}
      {(dashboard.filters.length > 0 || editing) && (
        <section className="mt-4">
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <div className="flex items-center gap-2">
              <Filter size={14} className="text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">
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
                onAdd={() => handleOpenAddFilter("dropdown")}
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
          className={editing && pageWidgets.length > 0 ? "dashboard-edit-grid" : ""}
        >
          {pageWidgets.length === 0 ? (
            <div
              onDragOver={handleEmptyCanvasDragOver}
              onDrop={handleEmptyCanvasDrop}
              className={cn(
                "flex flex-col items-center justify-center rounded-lg border p-12 text-center transition-colors",
                editing
                  ? "border-dashed border-primary/35 bg-primary/3"
                  : "border-dashed border-border bg-card"
              )}
            >
              <div
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-full",
                  editing
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {editing ? <Sparkles size={24} /> : <Plus size={24} />}
              </div>
              <h2 className="mt-4 text-base font-semibold text-foreground">
                {editing
                  ? "Prancheta pronta para montagem"
                  : "Nenhum widget adicionado"}
              </h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                {editing
                  ? "Arraste qualquer gráfico da biblioteca lateral diretamente para esta área, ou utilize os botões abaixo para montar seu painel."
                  : "Adicione gráficos e análises salvos para visualizar seus dados neste painel."}
              </p>
              <div className="mt-6 flex flex-wrap gap-2.5 justify-center">
                {editing && (
                  <Button
                    onClick={() => {
                      setDrawerTab("library")
                      setDrawerOpen(true)
                    }}
                  >
                    <LayoutGrid size={15} />
                    Abrir biblioteca lateral
                  </Button>
                )}
                <Button
                  onClick={() => setAddDialogOpen(true)}
                >
                  <Plus size={16} />
                  Adicionar por lista
                </Button>
              </div>
            </div>
          ) : (
            <DashboardCanvas
              key={activePageId}
              dashboard={{ ...dashboard, widgets: pageWidgets }}
              editing={editing}
              filterValues={filterValues}
              distinctValues={distinctValues}
              loadingDistinct={loadingDistinct}
              onFilterValueChange={handleFilterValueChange}
              refreshKey={refreshKey}
              selectedWidgetId={selectedWidgetId}
              onRemoveWidget={handleRemoveWidget}
              onConfigure={handleConfigure}
              onSelectWidget={handleSelectWidget}
              onDuplicateWidget={handleDuplicateWidget}
              onCopyWidget={handleCopyWidget}
              onBringToFront={handleBringToFront}
              onSendToBack={handleSendToBack}
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
        key={addFilterOpen ? `open-${filterPreset}` : "closed"}
        open={addFilterOpen}
        onOpenChange={setAddFilterOpen}
        onAdd={handleAddFilter}
        existingFilters={dashboard.filters}
        dashboardWidgetAnalysisIds={dashboard.widgets.flatMap((widget) =>
          widget.analysisId ? [widget.analysisId] : []
        )}
        initialControlType={filterPreset}
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

      {/* Barra inferior de páginas (abas) */}
      <DashboardPageBar
        pages={dashboard.pages}
        activePageId={activePageId}
        editing={editing}
        onSelect={handleSelectPage}
        onAdd={handleAddPage}
        onRename={handleRenamePage}
        onMove={handleMovePage}
        onDelete={(pageId) =>
          setPagePendingDelete(
            dashboard.pages.find((page) => page.id === pageId) ?? null
          )
        }
      />

      {/* Exclusão de página — remove também os widgets da página */}
      <DeleteConfirmationDialog
        open={pagePendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPagePendingDelete(null)
        }}
        title="Excluir página"
        itemName={pagePendingDelete?.name ?? ""}
        description={
          pagePendingDelete
            ? `A página "${pagePendingDelete.name}" e todos os widgets nela serão excluídos. Esta ação não pode ser desfeita.`
            : undefined
        }
        confirmLabel="Excluir página"
        onConfirm={handleConfirmDeletePage}
      />

      {/* Lateral direita: Biblioteca | Propriedades (Etapa C). A biblioteca
          segue montada na aba oculta para preservar busca e categoria. */}
      {editing && drawerOpen && (
        <div className="fixed inset-y-0 right-0 top-16 z-40 flex flex-col">
          <div
            role="tablist"
            aria-label="Alternar biblioteca e propriedades"
            className="flex shrink-0 gap-1 border-b border-l border-border bg-card px-3 pt-2"
          >
            {(
              [
                { id: "library", label: "Biblioteca" },
                { id: "props", label: "Propriedades" },
              ] as const
            ).map((tab) => {
              const disabled = tab.id === "props" && selectedWidget === null
              const active =
                tab.id === drawerTab && !(tab.id === "props" && selectedWidget === null)
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={active}
                  disabled={disabled}
                  onClick={() => setDrawerTab(tab.id)}
                  className={cn(
                    "rounded-t-md px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted",
                    disabled && "cursor-not-allowed opacity-50"
                  )}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
          <div className="flex min-h-0 flex-1">
            <div className={cn("min-h-0", drawerTab === "library" || selectedWidget === null ? "flex" : "hidden")}>
              <DashboardComponentsDrawer
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                onSelectAnalysis={(analysis, pos) => handleAddAnalysis(analysis, pos)}
                onSelectElement={(config) => handleAddElement(config)}
                onAddFilter={handleOpenAddFilter}
                existingAnalysisIds={excludeAnalysisIds}
                projectId={dashboard.projectId}
                projectName={projectName}
              />
            </div>
            {drawerTab === "props" && selectedWidget !== null && (
              <DashboardPropertiesPanel
                widget={selectedWidget}
                filters={dashboard.filters}
                dashboardAnalysisIds={dashboardAnalysisIds}
                linkedCards={selectedFilterLinkedCards}
                filterValues={filterValues}
                onSaveLayout={handleSaveWidgetLayout}
                onSaveConfig={handleSaveWidgetConfig}
                onSaveFilter={handleSaveFilter}
                onClearFilterValue={handleClearFilterValue}
                onBringToFront={handleBringToFront}
                onSendToBack={handleSendToBack}
                onRemoveWidget={handleRemoveWidget}
                onClose={() => setDrawerTab("library")}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
