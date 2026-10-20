"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Eye,
  Info,
  LayoutGrid,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Undo2,
  Redo2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Dashboard, DashboardAppearance, DashboardFilter, DashboardPage, DashboardWidget } from "@/lib/types/dashboard"
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
import { cn, getDashboardSharePath } from "@/lib/utils"
import { ApiError } from "@/lib/api"
import { getDistinctValues } from "@/lib/api/datasets"
import { AddAnalysisDialog } from "./add-analysis-dialog"
import { AddFilterDialog } from "./add-filter-dialog"
import { ShareDashboardDialog } from "./share-dashboard-dialog"
import { EditDashboardInfoDialog } from "./edit-dashboard-info-dialog"
import { DashboardCanvas } from "./dashboard-canvas"
import { DashboardPageBar } from "./dashboard-page-bar"
import { DeleteConfirmationDialog } from "@/components/shared/delete-confirmation-dialog"
import { WidgetConfigDialog } from "./widget-config-dialog"
import { DashboardComponentsDrawer } from "./dashboard-components-drawer"
import { DashboardPropertiesPanel } from "./dashboard-properties-panel"
import type { FilterControlType } from "@/lib/types/dashboard"
import type { CanvasDropAnalysisData } from "./dashboard-canvas"
import { clampStageRect, type PageAlignEdge } from "./canvas-stage"
import {
  DEFAULT_REPORT_PAGE,
  defaultLayerForConfig,
  geometryForCanvas,
  gridSize,
  layoutForWidgets,
  pixelToGridGeometry,
  readCanvasLayout,
  withPixelGeometry,
  type CanvasLayoutDocument,
  type CanvasPageLayout,
  type PixelRect,
} from "@/lib/canvas-layout"

interface DashboardBuilderProps {
  dashboard: Dashboard
  onDashboardChange: (dashboard: Dashboard) => void
}

/** Página ativa + documento completo (espelhos de grade para widgets sem pixel). */
function pageContext(target: Dashboard): {
  pageId: string
  page: CanvasPageLayout
  doc: CanvasLayoutDocument
} {
  const pageId = resolveActivePageId(target)
  const doc = layoutForWidgets(
    target.widgets,
    target.pages.map((p) => p.id),
    readCanvasLayout(target.appearance?.layoutDocument)
  )
  const page = doc.pages[pageId] ?? DEFAULT_REPORT_PAGE
  return { pageId, page, doc }
}

/** Primeira faixa livre abaixo dos widgets da página, em pixels. */
function appendPixelY(
  widgets: DashboardWidget[],
  doc: CanvasLayoutDocument,
  page: CanvasPageLayout
): number {
  let appendY = 0
  for (const widget of widgets) {
    const rect = geometryForCanvas(widget, doc, page)
    appendY = Math.max(appendY, rect.y + rect.h)
  }
  return appendY
}

export function DashboardBuilder({
  dashboard,
  onDashboardChange,
}: DashboardBuilderProps) {
  const [editing, setEditing] = useState(false)
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true)
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  // Aba ativa da lateral direita
  const [rightPanelTab, setRightPanelTab] = useState<"props" | "layers">("props")
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [addFilterOpen, setAddFilterOpen] = useState(false)
  // Controle pré-selecionado ao abrir o diálogo pela biblioteca.
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
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved")
  const undoRef = useRef<Dashboard[]>([])
  const redoRef = useRef<Dashboard[]>([])
  const [, setHistoryVersion] = useState(0)

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
          setSaveStatus("saving")
          await updateDashboard(snapshot.id, toDashboardPayload(snapshot))
        } catch (err) {
          setSaveError(
            err instanceof ApiError
              ? err.detail
              : "Não foi possível salvar o painel."
          )
          setSaveStatus("error")
          return
        }

        if (latestRef.current === snapshot) {
          dirtyRef.current = false
        }
        setSaveError(null)
        setSaveStatus("saved")
      }
    } finally {
      workingRef.current = false
    }
  }, [])

  const persist = useCallback(
    (next: Dashboard, recordHistory = true) => {
      if (recordHistory && latestRef.current !== next) {
        undoRef.current = [...undoRef.current.slice(-49), latestRef.current]
        redoRef.current = []
        setHistoryVersion((version) => version + 1)
      }
      latestRef.current = next
      dirtyRef.current = true
      setSaveStatus("saving")
      onDashboardChange(next)
      void pump()
    },
    [onDashboardChange, pump]
  )

  const handleUndo = useCallback(() => {
    const previous = undoRef.current.pop()
    if (!previous) return
    redoRef.current = [...redoRef.current, latestRef.current]
    setHistoryVersion((version) => version + 1)
    persist(previous, false)
  }, [persist])

  const handleRedo = useCallback(() => {
    const next = redoRef.current.pop()
    if (!next) return
    undoRef.current = [...undoRef.current, latestRef.current]
    setHistoryVersion((version) => version + 1)
    persist(next, false)
  }, [persist])

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
  // Loading por filterId: um filtro carregando não congela os demais.
  const [loadingDistinct, setLoadingDistinct] = useState<Record<string, boolean>>({})

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
      requestAnimationFrame(() => {
        setDistinctValues({})
        setLoadingDistinct({})
      })
      return
    }

    let cancelled = false
    async function load() {
      setLoadingDistinct((prev) => {
        const next = { ...prev }
        for (const f of dashboard.filters) next[f.id] = true
        return next
      })

      for (const f of dashboard.filters) {
        let values: string[] = []
        try {
          const res = await getDistinctValues(f.datasetId, f.column)
          values = res.result ?? []
        } catch {
          values = []
        }
        if (cancelled) return
        setDistinctValues((prev) => ({ ...prev, [f.id]: values }))
        setLoadingDistinct((prev) => ({ ...prev, [f.id]: false }))
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [dashboard.filters])

  // Geometria pixel-authoritative no documento + espelho grade em
  // widget.layout (contrato da API permanece em unidades de grade).
  const handleWidgetGeometryChange = useCallback(
    (widgetId: string, pixel: PixelRect) => {
      const current = latestRef.current
      const target = current.widgets.find((w) => w.id === widgetId)
      if (!target) return
      const { page, doc } = pageContext(current)
      const nextDoc = withPixelGeometry(doc, target, pixel)
      const mirror = pixelToGridGeometry(pixel, page)
      const nextWidgets = current.widgets.map((w) =>
        w.id === widgetId ? { ...w, layout: mirror } : w
      )
      persist({
        ...current,
        widgets: nextWidgets,
        appearance: { ...current.appearance, layoutDocument: nextDoc },
      })
    },
    [persist]
  )

  const handleAddAnalysis = useCallback(
    (analysis: Analysis, position?: PixelRect) => {
      const current = latestRef.current
      const { pageId, page, doc } = pageContext(current)
      const pageWidgets = widgetsForPage(current.widgets, pageId)

      // mesmo gráfico pode existir em páginas diferentes (uma por página)
      if (pageWidgets.some((widget) => widget.analysisId === analysis.id)) {
        return
      }

      const { colWidth, rowHeight } = gridSize(page)
      const rect = clampStageRect(
        position ?? {
          x: 0,
          y: appendPixelY(pageWidgets, doc, page),
          w: colWidth * 6,
          h: rowHeight * 4,
        },
        page
      )
      const newWidget: DashboardWidget = {
        id: crypto.randomUUID(),
        analysisId: analysis.id,
        layout: pixelToGridGeometry(rect, page),
        config: legacyToWidgetConfig(analysis),
        pageId,
      }

      const updated = [...current.widgets, newWidget]
      const nextDoc = withPixelGeometry(
        layoutForWidgets(updated, current.pages.map((p) => p.id), doc),
        newWidget,
        rect
      )
      persist({
        ...current,
        widgets: updated,
        appearance: { ...current.appearance, layoutDocument: nextDoc },
      })
    },
    [persist]
  )

  const handleAddElement = useCallback(
    (config: WidgetConfig, position?: PixelRect) => {
      const current = latestRef.current
      const { pageId, page, doc } = pageContext(current)
      const pageWidgets = widgetsForPage(current.widgets, pageId)
      const { colWidth, rowHeight } = gridSize(page)
      const rect = clampStageRect(
        position ?? {
          x: 0,
          y: appendPixelY(pageWidgets, doc, page),
          w: colWidth * 4,
          h: rowHeight * (config.type === "text" ? 2 : 3),
        },
        page
      )
      const widget: DashboardWidget = {
        id: crypto.randomUUID(),
        analysisId: null,
        config,
        layout: pixelToGridGeometry(rect, page),
        pageId,
      }
      const updated = [...current.widgets, widget]
      const nextDoc = withPixelGeometry(
        layoutForWidgets(updated, current.pages.map((p) => p.id), doc),
        widget,
        rect
      )
      persist({
        ...current,
        widgets: updated,
        appearance: { ...current.appearance, layoutDocument: nextDoc },
      })
    },
    [persist]
  )

  const handleDropAnalysis = useCallback(
    async (data: CanvasDropAnalysisData) => {
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

  const handleRemoveWidget = useCallback(
    (widgetId: string) => {
      // Widget de filtro e filtro são 1:1: excluir o widget também exclui o
      // filtro vinculado (senão o filtro ficaria invisível mas ainda ativo
      // nas consultas, sem UI para controlá-lo).
      const widget = dashboard.widgets.find((w) => w.id === widgetId)
      if (widget?.config?.type === "filter") {
        handleRemoveFilter(widget.config.filterId)
        setSelectedWidgetId((prev) => (prev === widgetId ? null : prev))
        return
      }

      const updated = {
        ...dashboard,
        widgets: dashboard.widgets.filter((w) => w.id !== widgetId),
      }

      persist(updated)
      setSelectedWidgetId((prev) => (prev === widgetId ? null : prev))
    },
    [dashboard, persist, handleRemoveFilter]
  )

  const handleSelectWidget = useCallback((widgetId: string | null) => {
    setSelectedWidgetId(widgetId)
    if (widgetId !== null) {
      setRightSidebarOpen(true)
      setRightPanelTab("props")
    }
  }, [])

  const handleOpenAddFilter = useCallback((preset: FilterControlType = "dropdown") => {
    setFilterPreset(preset)
    setAddFilterOpen(true)
  }, [])

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
      const { pageId, page, doc } = pageContext(current)
      const { colWidth } = gridSize(page)
      const sourcePixel = geometryForCanvas(source, doc, page)
      const rect = clampStageRect(
        {
          x: Math.min(
            sourcePixel.x + colWidth,
            Math.max(0, page.width - sourcePixel.w)
          ),
          y: appendPixelY(widgetsForPage(current.widgets, pageId), doc, page),
          w: sourcePixel.w,
          h: sourcePixel.h,
        },
        page
      )
      const resolved: DashboardWidget = {
        ...copy,
        layout: pixelToGridGeometry(rect, page),
        pageId,
      }
      const updated = [...current.widgets, resolved]
      const nextDoc = withPixelGeometry(
        layoutForWidgets(updated, current.pages.map((p) => p.id), doc),
        resolved,
        rect
      )
      persist({
        ...current,
        widgets: updated,
        appearance: { ...current.appearance, layoutDocument: nextDoc },
      })
      setSelectedWidgetId(resolved.id)
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
    const { pageId, page, doc } = pageContext(current)
    const pasted = pasteWidgetPayload(payload, pageId)
    const { colWidth, rowHeight } = gridSize(page)
    const rect = clampStageRect(
      {
        x: 0,
        y: appendPixelY(widgetsForPage(current.widgets, pageId), doc, page),
        w: pasted.layout.w * colWidth,
        h: pasted.layout.h * rowHeight,
      },
      page
    )
    const resolved: DashboardWidget = {
      ...pasted,
      layout: pixelToGridGeometry(rect, page),
    }
    const updated = [...current.widgets, resolved]
    const nextDoc = withPixelGeometry(
      layoutForWidgets(updated, current.pages.map((p) => p.id), doc),
      resolved,
      rect
    )
    persist({
      ...current,
      widgets: updated,
      appearance: { ...current.appearance, layoutDocument: nextDoc },
    })
    setSelectedWidgetId(resolved.id)
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

  const handleChangeLayer = useCallback(
    (widgetId: string, layer: "background" | "data" | "foreground") => {
      const current = latestRef.current
      if (!current.widgets.some((w) => w.id === widgetId)) return
      const baseDocument = layoutForWidgets(
        current.widgets,
        current.pages.map((page) => page.id),
        readCanvasLayout(current.appearance?.layoutDocument)
      )
      const objects = { ...baseDocument.objects }
      const currentGeometry = objects[widgetId]
      if (currentGeometry) objects[widgetId] = { ...currentGeometry, layer }
      persist({
        ...current,
        appearance: { ...current.appearance, layoutDocument: { ...baseDocument, objects } },
      })
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

  // Nudge por setas: 1px, 10px com Shift — posicionamento livre, sem grade.
  const handleNudgeSelected = useCallback(
    (widgetId: string, dx: number, dy: number) => {
      const current = latestRef.current
      const target = current.widgets.find((w) => w.id === widgetId)
      if (!target) return
      const { page, doc } = pageContext(current)
      const pixel = geometryForCanvas(target, doc, page)
      handleWidgetGeometryChange(widgetId, {
        ...pixel,
        x: pixel.x + dx,
        y: pixel.y + dy,
      })
    },
    [handleWidgetGeometryChange]
  )

  // Alinhamento à página (Power BI-style): reposiciona sem redimensionar.
  const handleAlignToPage = useCallback(
    (widgetId: string, edge: PageAlignEdge) => {
      const current = latestRef.current
      const target = current.widgets.find((w) => w.id === widgetId)
      if (!target) return
      const { page, doc } = pageContext(current)
      const pixel = geometryForCanvas(target, doc, page)
      let next: PixelRect = pixel
      switch (edge) {
        case "left":
          next = { ...pixel, x: 0 }
          break
        case "center-h":
          next = { ...pixel, x: Math.round((page.width - pixel.w) / 2) }
          break
        case "right":
          next = { ...pixel, x: page.width - pixel.w }
          break
        case "top":
          next = { ...pixel, y: 0 }
          break
        case "middle":
          next = { ...pixel, y: Math.round((page.height - pixel.h) / 2) }
          break
        case "bottom":
          next = { ...pixel, y: page.height - pixel.h }
          break
      }
      handleWidgetGeometryChange(widgetId, clampStageRect(next, page))
    },
    [handleWidgetGeometryChange]
  )

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

      if (selected !== null && event.key.startsWith("Arrow")) {
        event.preventDefault()
        const step = event.shiftKey ? 10 : 1
        const dx =
          event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0
        const dy =
          event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0
        if (dx !== 0 || dy !== 0) handleNudgeSelected(selected, dx, dy)
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
    handleNudgeSelected,
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
      const { pageId, page, doc } = pageContext(current)
      const pageWidgets = widgetsForPage(current.widgets, pageId)
      const { colWidth, rowHeight } = gridSize(page)
      const rect = clampStageRect(
        {
          x: 0,
          y: appendPixelY(pageWidgets, doc, page),
          w: colWidth * 4,
          h: rowHeight * 2,
        },
        page
      )
      const filterWidget: DashboardWidget = {
        id: crypto.randomUUID(),
        analysisId: null,
        config: { type: "filter", filterId: newFilter.id, title: newFilter.column },
        layout: pixelToGridGeometry(rect, page),
        pageId,
      }
      const updatedWidgets = [...current.widgets, filterWidget]
      const nextDoc = withPixelGeometry(
        layoutForWidgets(updatedWidgets, current.pages.map((p) => p.id), doc),
        filterWidget,
        rect
      )
      const updated = {
        ...current,
        widgets: updatedWidgets,
        filters: [...current.filters, newFilter],
        appearance: { ...current.appearance, layoutDocument: nextDoc },
      }

      persist(updated)

      setFilterValues((prev) => ({
        ...prev,
        [newFilter.id]: newFilter.defaultValue,
      }))

      setLoadingDistinct((prev) => ({ ...prev, [newFilter.id]: true }))
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
        .finally(() =>
          setLoadingDistinct((prev) => ({ ...prev, [newFilter.id]: false }))
        )
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

  // Etapa C: widget selecionado sempre resolvido na página ativa — nunca se
  // edita acidentalmente um widget da página anterior.
  const selectedWidget = useMemo(
    () => pageWidgets.find((w) => w.id === selectedWidgetId) ?? null,
    [pageWidgets, selectedWidgetId]
  )

  const currentLayer = useMemo(() => {
    if (!selectedWidgetId) return undefined
    const doc = readCanvasLayout(dashboard.appearance?.layoutDocument)
    if (!doc) return undefined
    return doc.objects[selectedWidgetId]?.layer ?? defaultLayerForConfig(selectedWidget?.config)
  }, [dashboard.appearance, selectedWidgetId])

  // Geometria pixel + página para o painel de propriedades (X/Y/L/A em px).
  const selectedGeometry = useMemo(() => {
    if (!selectedWidget) return null
    const doc = readCanvasLayout(dashboard.appearance?.layoutDocument)
    const pageId = resolveActivePageId(dashboard)
    const page = doc?.pages[pageId] ?? DEFAULT_REPORT_PAGE
    return { pixel: geometryForCanvas(selectedWidget, doc, page), page }
  }, [dashboard, selectedWidget])

  // Escopo por página: a biblioteca só esconde análises já usadas na aba atual.
  const excludeAnalysisIds = useMemo(
    () => pageWidgets.flatMap((widget) => widget.analysisId ? [widget.analysisId] : []),
    [pageWidgets]
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

    if (!editing) {
      return (
        <div
          className="px-4 sm:px-6 lg:px-8 pt-8 pb-20 transition-all duration-300"
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

          {/* Command bar viewing */}
          <section className="mt-3 rounded-xl border border-border bg-card/85 px-4 py-3 shadow-sm backdrop-blur">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Relatório</p>
                <h1 className="text-xl font-semibold tracking-tight text-foreground">
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

                <Button
                  size="sm"
                  onClick={() => {
                    setEditing(true)
                    setLeftSidebarOpen(true)
                    setRightSidebarOpen(true)
                  }}
                >
                  <Pencil size={14} />
                  Editar
                </Button>
              </div>
            </div>
          </section>

          {/* Viewing workspace */}
          <section className="mt-6">
            <div>
              {pageWidgets.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card p-12 text-center">
                  <Plus size={24} className="text-muted-foreground" />
                  <h2 className="mt-4 text-base font-semibold text-foreground">
                    Nenhum widget adicionado
                  </h2>
                  <p className="mt-1 max-w-md text-sm text-muted-foreground">
                    Adicione gráficos e análises salvos para visualizar seus dados neste painel.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-card">
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
                  />
                </div>
              )}
            </div>
          </section>

          <DashboardPageBar
            pages={dashboard.pages}
            activePageId={activePageId}
            editing={false}
            onSelect={handleSelectPage}
          />

          <ShareDashboardDialog
            open={shareOpen}
            onOpenChange={setShareOpen}
            dashboard={dashboard}
          />
          <EditDashboardInfoDialog
            open={infoOpen}
            onOpenChange={setInfoOpen}
            dashboard={dashboard}
            onSave={handleSaveInfo}
          />
        </div>
      )
    }

    // Modo Edição Studio: Full viewport com 3 colunas dockadas
    return (
      <div className="flex h-[calc(100vh-3.5rem)] w-full flex-col overflow-hidden bg-background">
        {/* Top bar compacta do Studio */}
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card/95 px-3 backdrop-blur z-30">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href={
                dashboard.projectId
                  ? `/projetos/${dashboard.projectId}/paineis`
                  : "/paineis"
              }
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-primary transition-colors"
              title="Voltar aos painéis"
            >
              <ArrowLeft size={16} />
            </Link>

            <div className="h-4 w-px bg-border" />

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-sm font-semibold text-foreground">
                  {dashboard.name}
                </h1>
                <span className={cn(
                  "hidden items-center gap-1 text-[11px] sm:inline-flex",
                  saveStatus === "error" ? "text-destructive" : "text-muted-foreground"
                )}>
                  <span className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    saveStatus === "saving" ? "animate-pulse bg-amber-500" : saveStatus === "error" ? "bg-destructive" : "bg-emerald-500"
                  )} />
                  {saveStatus === "saving" ? "Salvando..." : saveStatus === "error" ? "Erro" : "Salvo"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant={leftSidebarOpen ? "secondary" : "ghost"}
              size="sm"
              className="h-8 px-2.5 text-xs"
              onClick={() => setLeftSidebarOpen((v) => !v)}
              title="Alternar biblioteca de elementos"
            >
              <LayoutGrid size={14} className="mr-1 text-primary" />
              Elementos
            </Button>

            <Button
              variant={rightSidebarOpen ? "secondary" : "ghost"}
              size="sm"
              className="h-8 px-2.5 text-xs"
              onClick={() => setRightSidebarOpen((v) => !v)}
              title="Alternar painel lateral direito"
            >
              <Settings2 size={14} className="mr-1 text-primary" />
              Painel
            </Button>

            <div className="mx-1 h-4 w-px bg-border" />

            <Button
              variant="ghost"
              size="icon-sm"
              title="Desfazer (Ctrl+Z)"
              aria-label="Desfazer"
              disabled={undoRef.current.length === 0}
              onClick={handleUndo}
              className="h-8 w-8"
            >
              <Undo2 size={14} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Refazer (Ctrl+Y)"
              aria-label="Refazer"
              disabled={redoRef.current.length === 0}
              onClick={handleRedo}
              className="h-8 w-8"
            >
              <Redo2 size={14} />
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => setInfoOpen(true)}
              title="Informações e configurações do painel"
            >
              <Info size={13} />
            </Button>

            <Link href={viewerHref}>
              <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" title="Visualizar modo de apresentação">
                <Eye size={13} className="mr-1" />
                Visualizar
              </Button>
            </Link>

            <Button
              size="sm"
              className="h-8 px-3 text-xs font-medium"
              onClick={() => {
                setEditing(false)
                setSelectedWidgetId(null)
              }}
            >
              <Save size={13} className="mr-1" />
              Concluir
            </Button>
          </div>
        </header>

        {/* Notificação discreta de erro */}
        {saveError && (
          <div className="flex items-center gap-2 border-b border-destructive/20 bg-destructive/10 px-4 py-1.5 text-xs text-destructive">
            <AlertCircle size={14} />
            <span>{saveError}</span>
          </div>
        )}

        {/* Corpo Studio: 3 Colunas Integradas */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Coluna 1: Biblioteca de Elementos Dockada */}
          {leftSidebarOpen && (
            <div className="w-[340px] shrink-0 border-r border-border bg-card flex flex-col z-20">
              <DashboardComponentsDrawer
                open={true}
                onClose={() => setLeftSidebarOpen(false)}
                onSelectAnalysis={(analysis, pos) => handleAddAnalysis(analysis, pos)}
                onSelectElement={(config) => handleAddElement(config)}
                onAddFilter={handleOpenAddFilter}
                existingAnalysisIds={excludeAnalysisIds}
                projectId={dashboard.projectId}
                projectName={projectName}
              />
            </div>
          )}

          {/* Coluna 2: Canvas Central com preenchimento total */}
          <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-muted/40 p-2">
            <div className="dashboard-edit-grid relative h-full w-full rounded-xl border border-dashed border-border bg-card">
              <DashboardCanvas
                key={activePageId}
                dashboard={{ ...dashboard, widgets: pageWidgets }}
                editing={true}
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
                onWidgetGeometryChange={handleWidgetGeometryChange}
                onDropAnalysis={handleDropAnalysis}
              />
            </div>
          </main>

          {/* Coluna 3: Painel Direito Contextual (Propriedades / Camadas) */}
          {rightSidebarOpen && (
            <div className="w-[340px] shrink-0 border-l border-border bg-card flex flex-col z-20">
              {/* Abas contextuais do painel direito */}
              <div className="flex shrink-0 items-center border-b border-border bg-muted/40 px-2 pt-2 gap-1">
                <button
                  type="button"
                  onClick={() => setRightPanelTab("props")}
                  className={cn(
                    "flex-1 rounded-t-md px-3 py-1.5 text-xs font-medium transition-colors",
                    rightPanelTab === "props"
                      ? "bg-card text-foreground border-t border-x border-border font-semibold"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  Propriedades
                </button>
                <button
                  type="button"
                  onClick={() => setRightPanelTab("layers")}
                  className={cn(
                    "flex-1 rounded-t-md px-3 py-1.5 text-xs font-medium transition-colors",
                    rightPanelTab === "layers"
                      ? "bg-card text-foreground border-t border-x border-border font-semibold"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  Camadas ({pageWidgets.length})
                </button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={() => setRightSidebarOpen(false)}
                  title="Recolher painel"
                >
                  <X size={13} />
                </Button>
              </div>

              {/* Conteúdo da aba Propriedades */}
              {rightPanelTab === "props" && (
                <div className="flex-1 overflow-y-auto">
                  {selectedWidget !== null ? (
                    <DashboardPropertiesPanel
                      widget={selectedWidget}
                      pixel={selectedGeometry?.pixel}
                      page={selectedGeometry?.page}
                      filters={dashboard.filters}
                      dashboardAnalysisIds={dashboardAnalysisIds}
                      linkedCards={selectedFilterLinkedCards}
                      filterValues={filterValues}
                      onSavePixelLayout={handleWidgetGeometryChange}
                      onSaveConfig={handleSaveWidgetConfig}
                      onSaveFilter={handleSaveFilter}
                      onClearFilterValue={handleClearFilterValue}
                      onBringToFront={handleBringToFront}
                      onSendToBack={handleSendToBack}
                      onRemoveWidget={handleRemoveWidget}
                      onChangeLayer={handleChangeLayer}
                      onAlignToPage={handleAlignToPage}
                      currentLayer={currentLayer}
                      onClose={() => setSelectedWidgetId(null)}
                    />
                  ) : (
                    <div className="p-4 space-y-4">
                      <div className="rounded-lg border border-border bg-muted/30 p-4 text-center">
                        <Sparkles size={20} className="mx-auto text-primary mb-2" />
                        <h3 className="text-xs font-semibold text-foreground">
                          Nenhum elemento selecionado
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                          Clique em qualquer cartão da prancheta para configurar estilo, filtros e dimensões em pixels.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Ações Rápidas
                        </h4>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full justify-start text-xs h-8"
                          onClick={() => setAddDialogOpen(true)}
                        >
                          <Plus size={13} className="mr-1.5 text-primary" />
                          Adicionar análise salva
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full justify-start text-xs h-8"
                          onClick={() => handleOpenAddFilter("dropdown")}
                        >
                          <SlidersHorizontal size={13} className="mr-1.5 text-primary" />
                          Adicionar filtro interativo
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Conteúdo da aba Camadas */}
              {rightPanelTab === "layers" && (
                <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                  <p className="px-1 pb-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    Ordem de exibição
                  </p>
                  {pageWidgets.length === 0 ? (
                    <p className="p-3 text-xs text-muted-foreground text-center">
                      Nenhum elemento nesta página.
                    </p>
                  ) : (
                    [...pageWidgets]
                      .reverse()
                      .map((widget) => {
                        const isSelected = selectedWidgetId === widget.id
                        return (
                          <div
                            key={widget.id}
                            onClick={() => {
                              setSelectedWidgetId(widget.id)
                              setRightPanelTab("props")
                            }}
                            className={cn(
                              "flex items-center justify-between rounded-lg border px-3 py-2 text-xs transition-colors cursor-pointer",
                              isSelected
                                ? "border-primary bg-primary/10 text-primary font-medium"
                                : "border-border bg-card hover:bg-muted text-foreground"
                            )}
                          >
                            <span className="truncate pr-2">
                              {widget.config?.title || (widget.analysisId ? "Gráfico" : "Elemento")}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="h-6 w-6"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleBringToFront(widget.id)
                                }}
                                title="Trazer para frente"
                              >
                                <ArrowUp size={11} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="h-6 w-6"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleSendToBack(widget.id)
                                }}
                                title="Enviar para trás"
                              >
                                <ArrowDown size={11} />
                              </Button>
                            </div>
                          </div>
                        )
                      })
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Barra inferior de páginas (abas) */}
        <div className="shrink-0">
          <DashboardPageBar
            pages={dashboard.pages}
            activePageId={activePageId}
            editing={true}
            drawerOpen={false}
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
        </div>

        {/* Diálogos modais complementares */}
        <AddAnalysisDialog
          open={addDialogOpen}
          onOpenChange={setAddDialogOpen}
          onSelect={handleAddAnalysis}
          excludeIds={excludeAnalysisIds}
        />
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
        <ShareDashboardDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          dashboard={dashboard}
        />
        <EditDashboardInfoDialog
          open={infoOpen}
          onOpenChange={setInfoOpen}
          dashboard={dashboard}
          onSave={handleSaveInfo}
        />
        <WidgetConfigDialog
          widget={
            dashboard.widgets.find((w) => w.id === configuringWidgetId) ?? null
          }
          onOpenChange={(open) => {
            if (!open) setConfiguringWidgetId(null)
          }}
          onSave={handleConfigSave}
        />
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
      </div>
    )
}
