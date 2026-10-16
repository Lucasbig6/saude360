"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertCircle,
  BarChart3,
  Check,
  ChevronRight,
  FileChartColumn,
  GripVertical,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Shapes,
  SlidersHorizontal,
  Sparkles,
  Table2,
  Type as TypeIcon,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { Analysis } from "@/lib/types/analysis"
import { chartTypeIcon, chartTypeLabel } from "@/lib/types/charts"
import { getAnalyses } from "@/lib/api/analyses"
import { ApiError } from "@/lib/api"
import type { FilterControlType } from "@/lib/types/dashboard"
import type { WidgetConfig } from "@/lib/types/widgets"
import {
  createShapeElement,
  createTextElement,
} from "@/lib/dashboard-elements"
import { prepareDashboardImage } from "@/lib/dashboard-image"
import {
  AnalysisThumbnail,
  clearThumbnailCache,
} from "@/components/dashboard/analysis-thumbnail"

export interface DashboardComponentsDrawerProps {
  open: boolean
  onClose: () => void
  onSelectAnalysis: (
    analysis: Analysis,
    position?: { x?: number; y?: number; w?: number; h?: number }
  ) => void
  onSelectElement?: (config: WidgetConfig) => void
  /** Abre o diálogo de filtro, com o controle pré-selecionado quando dado. */
  onAddFilter?: (controlType?: FilterControlType) => void
  existingAnalysisIds: string[]
  /**
   * Projeto do painel sendo editado: a biblioteca lista só as análises
   * dele. `null`/ausente = painel sem projeto -> lista todas (com aviso).
   */
  projectId?: string | null
  /** Nome do projeto, exibido no cabeçalho. */
  projectName?: string | null
  className?: string
}

type FilterCategory = "all" | "charts" | "tables" | "text" | "shapes" | "images" | "filters" | "custom"

export function DashboardComponentsDrawer({
  open,
  onClose,
  onSelectAnalysis,
  onSelectElement = () => undefined,
  onAddFilter = () => undefined,
  existingAnalysisIds,
  projectId = null,
  projectName = null,
  className,
}: DashboardComponentsDrawerProps) {
  // Estado carregado por chave derivada (reloadKey): "carregando" é a ausência
  // de resultado para a chave atual — evita setState síncrono no corpo do
  // efeito, conforme a regra react-hooks/set-state-in-effect.
  const [analysesLoad, setAnalysesLoad] = useState<{
    key: string
    items: Analysis[]
    error: string | null
  } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // Escopo da busca: projeto do painel (ou nenhum = todas as análises).
  const scopeKey = projectId ?? "*"
  const loadKey = `${scopeKey}#${reloadKey}`

  const [search, setSearch] = useState("")
  const [category, setCategory] = useState<FilterCategory>("all")
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  // Evita disparar o clique (adicionar ao painel) logo após um drag.
  const suppressClickRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    getAnalyses(projectId ?? undefined)
      .then((list) => {
        if (!cancelled) {
          setAnalysesLoad({ key: loadKey, items: list, error: null })
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setAnalysesLoad({
            key: loadKey,
            items: [],
            error:
              err instanceof ApiError ? err.detail : "Erro ao carregar gráficos.",
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [loadKey, projectId])

  const currentLoad = analysesLoad?.key === loadKey ? analysesLoad : null
  const loading = currentLoad === null
  const loadError = currentLoad?.error ?? null
  const analyses = currentLoad?.items ?? null

  const filteredAnalyses = useMemo(() => {
    if (!analyses) return []
    let list = analyses

    if (category === "charts") {
      list = list.filter((a) => a.chartType !== "table")
    } else if (category === "tables") {
      list = list.filter((a) => a.chartType === "table")
    } else if (category !== "all") {
      list = []
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.description && a.description.toLowerCase().includes(q))
      )
    }

    return [...list].sort((a, b) => {
      // Prioriza os que ainda não foram adicionados
      const aInDashboard = existingAnalysisIds.includes(a.id) ? 1 : 0
      const bInDashboard = existingAnalysisIds.includes(b.id) ? 1 : 0
      if (aInDashboard !== bInDashboard) return aInDashboard - bInDashboard
      return a.name.localeCompare(b.name)
    })
  }, [analyses, category, search, existingAnalysisIds])

  const libraryElements: { id: string; label: string; category: FilterCategory; config: WidgetConfig }[] = [
    { id: "text", label: "Bloco de texto", category: "text", config: createTextElement("body") },
    { id: "heading", label: "Título", category: "text", config: createTextElement("heading") },
    { id: "subtitle", label: "Subtítulo", category: "text", config: createTextElement("subtitle") },
    { id: "rectangle", label: "Retângulo", category: "shapes", config: createShapeElement("rectangle") },
    { id: "circle", label: "Círculo", category: "shapes", config: createShapeElement("circle") },
    { id: "line", label: "Linha", category: "shapes", config: createShapeElement("line") },
    { id: "divider", label: "Divisor", category: "shapes", config: createShapeElement("divider") },
    { id: "custom", label: "HTML/CSS restrito (em breve)", category: "custom", config: { type: "text", title: "Conteúdo", content: "" } },
  ]

  const filterPresets: { id: string; label: string; controlType: FilterControlType }[] = [
    { id: "filter-dropdown", label: "Lista suspensa", controlType: "dropdown" },
    { id: "filter-multi", label: "Seleção múltipla", controlType: "multi-select" },
    { id: "filter-list", label: "Lista de opções", controlType: "list" },
    { id: "filter-date", label: "Intervalo de datas", controlType: "date-range" },
  ]
  const visibleElements = libraryElements.filter((element) =>
    (category === "all" || category === element.category) &&
    (!search.trim() || element.label.toLowerCase().includes(search.toLowerCase()))
  )

  function addElement(config: WidgetConfig, key: string) {
    onSelectElement(config)
    setDraggingId(key)
    window.setTimeout(() => setDraggingId(null), 250)
  }

  async function handleImageFile(file?: File) {
    if (!file) return
    setImageError(null)
    try {
      const src = await prepareDashboardImage(file)
      onSelectElement({ type: "image", title: file.name, src, alt: file.name, fit: "contain" })
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "Imagem inválida.")
    }
  }

  if (!open) return null

  return (
    <aside
      aria-label="Biblioteca de componentes do painel"
      className={cn(
        "flex flex-col w-full sm:w-[390px] lg:w-[460px] shrink-0 border-l border-border bg-card shadow-lg z-20 transition-all",
        className
      )}
    >
      {/* Header do Drawer */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3.5 bg-muted/50/70">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/30">
            <LayoutGrid size={15} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground leading-none">
              Biblioteca de elementos
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Clique em um card ou arraste para o canvas
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => {
              clearThumbnailCache()
              setReloadKey((k) => k + 1)
            }}
            title="Recarregar gráficos"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            onClick={onClose}
            title="Fechar biblioteca"
          >
            <X size={15} />
          </Button>
        </div>
      </div>

      {/* Escopo: projeto do painel que está sendo editado */}
      <div
        className={cn(
          "flex items-start gap-2 border-b px-4 py-2 text-xs leading-snug",
          projectId
            ? "border-border bg-muted/50 text-muted-foreground"
            : "border-warning/20 bg-warning/10 text-warning"
        )}
      >
        <Layers size={13} className="mt-0.5 shrink-0" />
        <p>
          {projectId ? (
            <>
              Somente análises do projeto{" "}
              <strong className="font-semibold">
                {projectName ?? "selecionado"}
              </strong>
              .
            </>
          ) : (
            <>
              Painel sem projeto — mostrando todas as análises. Vincule um
              projeto para restringir esta lista.
            </>
          )}
        </p>
      </div>

      {/* Dica visual Metabase/Superset */}
      <div className="px-4 py-2.5 bg-primary/5 border-b border-primary/15 flex items-start gap-2">
        <Sparkles size={14} className="text-primary shrink-0 mt-0.5" />
        <p className="text-xs text-primary leading-snug">
          <strong>Dica:</strong> Arraste qualquer card diretamente para a posição
          desejada no painel. O grid ajusta automaticamente o encaixe.
        </p>
      </div>

      {/* Busca e Filtros */}
      <div className="p-3 border-b border-border space-y-2">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou descrição..."
            className="h-9 pl-8 pr-7 text-xs bg-muted/50/50 focus:bg-card border-border"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {(["all", "charts", "tables", "filters", "text", "shapes", "images", "custom"] as FilterCategory[]).map((item) => (
            <button key={item} type="button" onClick={() => setCategory(item)} className={cn("rounded-md px-2 py-1 text-xs font-medium", category === item ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
              {{ all: "Todos", charts: "Gráficos", tables: "Tabelas", filters: "Filtros", text: "Texto", shapes: "Formas", images: "Imagens", custom: "Personalizados" }[item]}
            </button>
          ))}
        </div>
      </div>

      {/* Conteúdo scrollável com os cards */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 scrollbar-thin">
        {(category === "all" || category === "filters") && (
          <div className="space-y-2">
            <p className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Filtros funcionais
            </p>
            {filterPresets
              .filter(
                (preset) =>
                  !search.trim() ||
                  preset.label.toLowerCase().includes(search.toLowerCase())
              )
              .map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onAddFilter(preset.controlType)}
                  className="flex w-full items-center gap-2 rounded-lg border border-border bg-card p-3 text-left text-sm hover:border-primary/40"
                >
                  <SlidersHorizontal size={15} className="shrink-0 text-primary" />
                  {preset.label}
                </button>
              ))}
          </div>
        )}
        {(category === "all" || category === "images") && (
          <>
            <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden" onChange={(event) => void handleImageFile(event.target.files?.[0])} />
            <button type="button" onClick={() => imageInputRef.current?.click()} className="flex w-full items-center gap-2 rounded-lg border border-border bg-card p-3 text-left text-sm hover:border-primary/40">
              <ImageIcon size={15} className="text-primary" /> Enviar PNG, JPEG ou SVG (até 2 MB)
            </button>
            {imageError && <p role="alert" className="text-xs text-destructive">{imageError}</p>}
          </>
        )}
        {visibleElements.map((element) => (
          <button
            key={element.id}
            type="button"
            draggable={element.category !== "custom"}
            onClick={() => element.category !== "custom" && addElement(element.config, element.id)}
            onDragStart={(event) => {
              if (element.category === "custom") { event.preventDefault(); return }
              event.dataTransfer.setData("application/json", JSON.stringify({ config: element.config, w: 4, h: element.category === "text" ? 2 : 3 }))
              event.dataTransfer.effectAllowed = "copy"
            }}
            className="flex w-full items-center gap-2 rounded-lg border border-border bg-card p-3 text-left text-sm hover:border-primary/40"
          >
            {element.category === "shapes" ? <Shapes size={15} className="text-primary" /> : <TypeIcon size={15} className="text-primary" />}
            {element.label}
          </button>
        ))}
        {category === "custom" && <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">Conteúdo HTML/CSS restrito ainda não está habilitado. JavaScript arbitrário não será executado.</p>}
        {loading && !analyses && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Loader2 size={24} className="animate-spin text-primary mb-2" />
            <span className="text-xs">Carregando análises salvas...</span>
          </div>
        )}

        {loadError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-center">
            <AlertCircle size={16} className="text-destructive mx-auto mb-1" />
            <p className="text-xs text-destructive">{loadError}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                clearThumbnailCache()
                setReloadKey((k) => k + 1)
              }}
              className="mt-2 h-7 text-xs"
            >
              Tentar novamente
            </Button>
          </div>
        )}

        {!loading && !loadError && filteredAnalyses.length === 0 && (
          <div className="text-center py-10 px-4">
            <FileChartColumn size={28} className="mx-auto text-muted-foreground mb-2" />
            <p className="text-xs font-medium text-foreground">
              Nenhuma análise encontrada
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {search
                ? "Tente buscar por outro termo ou limpe o filtro."
                : "Crie novas análises na aba 'Explorar' ou 'Análises'."}
            </p>
          </div>
        )}

        {filteredAnalyses.map((analysis) => {
          const Icon = chartTypeIcon[analysis.chartType] ?? BarChart3
          const inDashboard = existingAnalysisIds.includes(analysis.id)
          const isDragging = draggingId === analysis.id

          return (
            <div
              key={analysis.id}
              draggable
              data-analysis-id={analysis.id}
              data-gs-width="6"
              data-gs-height="4"
              data-gs-widget={JSON.stringify({
                w: 6,
                h: 4,
                analysisId: analysis.id,
              })}
              onDragStart={(e) => {
                suppressClickRef.current = true
                setDraggingId(analysis.id)
                // Alguns navegadores e o adaptador de drag do GridStack podem
                // disparar um DragEvent sem DataTransfer. Os data-attributes
                // acima continuam disponíveis para o GridStack nesse caso.
                const dataTransfer = e.dataTransfer
                if (!dataTransfer) return

                dataTransfer.effectAllowed = "copy"
                dataTransfer.setData(
                  "application/json",
                  JSON.stringify({
                    analysisId: analysis.id,
                    w: 6,
                    h: 4,
                  })
                )
                dataTransfer.setData("text/plain", analysis.id)
              }}
              onDragEnd={() => {
                setDraggingId(null)
                // Clique não deve disparar logo após um drag (adicionaria o card).
                window.setTimeout(() => {
                  suppressClickRef.current = false
                }, 0)
              }}
              onClick={() => {
                if (suppressClickRef.current) return
                onSelectAnalysis(analysis)
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  onSelectAnalysis(analysis)
                }
              }}
              role="button"
              tabIndex={0}
              className={cn(
                "grid-stack-item-drag-in group relative flex flex-col rounded-lg border p-3 bg-card transition-all select-none cursor-pointer",
                isDragging
                  ? "opacity-50 border-primary scale-95 shadow-inner"
                  : "border-border hover:border-primary/50 ",
                inDashboard && "bg-muted/50/60"
              )}
            >
              {/* Miniatura com o gráfico real (dados da análise) */}
              <div className="pointer-events-none h-28 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/50">
                <AnalysisThumbnail analysis={analysis} />
              </div>

              {/* Tipo, nome e ações */}
              <div className="mt-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Icon size={11} className="shrink-0" />
                    {chartTypeLabel[analysis.chartType] ?? "Gráfico"}
                  </span>
                  <h3 className="text-xs font-semibold text-foreground truncate">
                    {analysis.name}
                  </h3>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {inDashboard && (
                    <span
                      title="Este gráfico já está adicionado ao painel"
                      className="inline-flex items-center gap-0.5 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground border border-border"
                    >
                      <Check size={10} className="text-primary" />
                      No painel
                    </span>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelectAnalysis(analysis)
                    }}
                    title="Adicionar ao final do painel"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg"
                  >
                    <Plus size={14} />
                  </Button>
                </div>
              </div>

              {/* Descrição se houver */}
              {analysis.description && (
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                  {analysis.description}
                </p>
              )}

              {/* Rodapé do card: dimensões recomendadas e grip indicator */}
              <div className="mt-auto flex items-center justify-between border-t border-border pt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="font-mono font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    6 × 4
                  </span>
                  <span>tamanho padrão</span>
                </span>
                <span className="flex items-center gap-1 group-hover:text-primary transition-colors font-medium">
                  <GripVertical size={12} />
                  Arraste para soltar
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer com contagem */}
      <div className="border-t border-border px-4 py-2.5 bg-muted/50 text-xs text-muted-foreground flex items-center justify-between">
        <span>
          Exibindo {filteredAnalyses.length} de {analyses?.length ?? 0}
        </span>
        <button
          onClick={onClose}
          className="text-primary hover:text-primary font-medium inline-flex items-center gap-0.5"
        >
          Ocultar biblioteca
          <ChevronRight size={12} />
        </button>
      </div>
    </aside>
  )
}
