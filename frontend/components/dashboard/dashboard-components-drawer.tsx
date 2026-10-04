"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertCircle,
  BarChart3,
  Check,
  ChevronRight,
  FileChartColumn,
  GripVertical,
  Layers,
  LayoutGrid,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Table2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { Analysis } from "@/lib/types/analysis"
import { chartTypeIcon, chartTypeLabel } from "@/lib/types/charts"
import { getAnalyses } from "@/lib/api/analyses"
import { ApiError } from "@/lib/api"
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

type FilterCategory = "all" | "charts" | "tables"

export function DashboardComponentsDrawer({
  open,
  onClose,
  onSelectAnalysis,
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

  if (!open) return null

  return (
    <aside
      aria-label="Biblioteca de componentes do painel"
      className={cn(
        "flex flex-col w-full sm:w-[390px] lg:w-[460px] shrink-0 border-l border-slate-200 bg-white shadow-xl z-20 transition-all",
        className
      )}
    >
      {/* Header do Drawer */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3.5 bg-slate-50/70">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-600 border border-teal-200/60">
            <LayoutGrid size={15} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900 leading-none">
              Biblioteca de Gráficos
            </h2>
            <p className="text-[11px] text-slate-500 mt-1">
              Clique em um card ou arraste para o canvas
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-slate-400 hover:text-slate-700"
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
            className="h-8 w-8 p-0 text-slate-400 hover:text-slate-700"
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
          "flex items-start gap-2 border-b px-4 py-2 text-[11px] leading-snug",
          projectId
            ? "border-slate-100 bg-slate-50 text-slate-600"
            : "border-amber-100 bg-amber-50 text-amber-900"
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
      <div className="px-4 py-2.5 bg-teal-50/50 border-b border-teal-100 flex items-start gap-2">
        <Sparkles size={14} className="text-teal-600 shrink-0 mt-0.5" />
        <p className="text-xs text-teal-900 leading-snug">
          <strong>Dica:</strong> Arraste qualquer card diretamente para a posição
          desejada no painel. O grid ajusta automaticamente o encaixe.
        </p>
      </div>

      {/* Busca e Filtros */}
      <div className="p-3 border-b border-slate-100 space-y-2">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou descrição..."
            className="h-9 pl-8 pr-7 text-xs bg-slate-50/50 focus:bg-white border-slate-200"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Categorias */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCategory("all")}
            className={cn(
              "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
              category === "all"
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100"
            )}
          >
            Todos ({analyses ? analyses.length : "…"})
          </button>
          <button
            type="button"
            onClick={() => setCategory("charts")}
            className={cn(
              "px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1",
              category === "charts"
                ? "bg-teal-700 text-white"
                : "text-slate-600 hover:bg-slate-100"
            )}
          >
            <BarChart3 size={12} />
            Gráficos
          </button>
          <button
            type="button"
            onClick={() => setCategory("tables")}
            className={cn(
              "px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1",
              category === "tables"
                ? "bg-teal-700 text-white"
                : "text-slate-600 hover:bg-slate-100"
            )}
          >
            <Table2 size={12} />
            Tabelas
          </button>
        </div>
      </div>

      {/* Conteúdo scrollável com os cards */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 scrollbar-thin">
        {loading && !analyses && (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <Loader2 size={24} className="animate-spin text-teal-600 mb-2" />
            <span className="text-xs">Carregando análises salvas...</span>
          </div>
        )}

        {loadError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
            <AlertCircle size={16} className="text-red-500 mx-auto mb-1" />
            <p className="text-xs text-red-700">{loadError}</p>
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
            <FileChartColumn size={28} className="mx-auto text-slate-300 mb-2" />
            <p className="text-xs font-medium text-slate-700">
              Nenhuma análise encontrada
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
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
                "grid-stack-item-drag-in group relative flex flex-col rounded-xl border p-3 bg-white transition-all select-none cursor-pointer",
                isDragging
                  ? "opacity-50 border-teal-500 scale-95 shadow-inner"
                  : "border-slate-200 hover:border-teal-400 hover:shadow-md",
                inDashboard && "bg-slate-50/60"
              )}
            >
              {/* Miniatura com o gráfico real (dados da análise) */}
              <div className="pointer-events-none h-28 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                <AnalysisThumbnail analysis={analysis} />
              </div>

              {/* Tipo, nome e ações */}
              <div className="mt-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                    <Icon size={11} className="shrink-0" />
                    {chartTypeLabel[analysis.chartType] ?? "Gráfico"}
                  </span>
                  <h3 className="text-xs font-semibold text-slate-900 truncate">
                    {analysis.name}
                  </h3>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {inDashboard && (
                    <span
                      title="Este gráfico já está adicionado ao painel"
                      className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 border border-slate-200"
                    >
                      <Check size={10} className="text-teal-600" />
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
                    className="h-7 w-7 p-0 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg"
                  >
                    <Plus size={14} />
                  </Button>
                </div>
              </div>

              {/* Descrição se houver */}
              {analysis.description && (
                <p className="mt-1 text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                  {analysis.description}
                </p>
              )}

              {/* Rodapé do card: dimensões recomendadas e grip indicator */}
              <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-2 text-[10px] text-slate-400">
                <span className="flex items-center gap-1">
                  <span className="font-mono font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                    6 × 4
                  </span>
                  <span>tamanho padrão</span>
                </span>
                <span className="flex items-center gap-1 group-hover:text-teal-600 transition-colors font-medium">
                  <GripVertical size={12} />
                  Arraste para soltar
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer com contagem */}
      <div className="border-t border-slate-200 px-4 py-2.5 bg-slate-50 text-[11px] text-slate-500 flex items-center justify-between">
        <span>
          Exibindo {filteredAnalyses.length} de {analyses?.length ?? 0}
        </span>
        <button
          onClick={onClose}
          className="text-teal-600 hover:text-teal-700 font-medium inline-flex items-center gap-0.5"
        >
          Ocultar biblioteca
          <ChevronRight size={12} />
        </button>
      </div>
    </aside>
  )
}
