"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Copy,
  Gauge,
  Image as ImageIcon,
  Loader2,
  MoreVertical,
  RefreshCw,
  SlidersHorizontal,
  Shapes,
  Table2,
  Trash2,
  Type as TypeIcon,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { CSSProperties } from "react"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { EChartRenderer } from "@/components/charts/EChartRenderer"
import { CHART_TYPE_META } from "@/components/charts/chart-types"
import { isChartType, type ChartNumberFormat } from "@/lib/charts/chart-config"
import { formatChartValue } from "@/lib/charts/format"
import type { Analysis } from "@/lib/types/analysis"
import type { DashboardFilter, DashboardWidget } from "@/lib/types/dashboard"
import {
  isChartWidgetConfig,
  kpiValue,
  legacyToWidgetConfig,
  type ShapeConfig,
  type StaticWidgetType,
  type WidgetConfig,
} from "@/lib/types/widgets"
import { assertChartType, getAnalysis } from "@/lib/api/analyses"
import { executeQuery, executeQueryFiltered, executePublicQuery } from "@/lib/api/queries"
import type { FilterClause } from "@/lib/api/queries"
import { ApiError } from "@/lib/api"

const STATIC_ICONS: Record<StaticWidgetType, LucideIcon> = {
  table: Table2,
  kpi: Gauge,
  text: TypeIcon,
  image: ImageIcon,
  shape: Shapes,
}

function formatKpi(
  value: number | null,
  format: ChartNumberFormat = "number"
): string {
  return formatChartValue(value, format)
}

/** Tipos apresentacionais: renderizam direto no canvas, sem card/header. */
const PRESENTATION_TYPES: ReadonlySet<string> = new Set(["text", "shape", "image"])

function isPresentationWidget(config: WidgetConfig): boolean {
  return PRESENTATION_TYPES.has(config.type)
}

/**
 * `WidgetStyle` do usuário no wrapper de apresentação: sem moldura de card
 * (borderColor/borderWidth são ignorados). `shape` recebe só camada —
 * preenchimento/contorno são os do `ShapeView`.
 */
function presentationStyle(config: WidgetConfig): CSSProperties {
  const style = config.style
  if (!style) return {}
  const layer: CSSProperties = {
    ...(style.opacity !== undefined ? { opacity: style.opacity } : {}),
    ...(style.zIndex !== undefined ? { zIndex: style.zIndex } : {}),
    ...(style.visible === false ? { display: "none" } : {}),
  }
  if (config.type === "shape") return layer
  return {
    ...layer,
    ...(style.backgroundColor ? { backgroundColor: style.backgroundColor } : {}),
    ...(style.borderRadius !== undefined ? { borderRadius: style.borderRadius } : {}),
    ...(style.shadow === "sm" ? { boxShadow: "0 1px 2px rgb(0 0 0 / 0.12)" } : {}),
    ...(style.shadow === "md" ? { boxShadow: "0 4px 10px rgb(0 0 0 / 0.16)" } : {}),
  }
}

interface WidgetActionsMenuProps {
  widgetId: string
  onRemove: (widgetId: string) => void
  onConfigure?: (widgetId: string) => void
  onDuplicateWidget?: (widgetId: string) => void
  onCopyWidget?: (widgetId: string) => void
  onBringToFront?: (widgetId: string) => void
  onSendToBack?: (widgetId: string) => void
  className?: string
}

/** Menu de ações do widget — compartilhado pelo header do card e pelo overlay. */
function WidgetActionsMenu({
  widgetId,
  onRemove,
  onConfigure,
  onDuplicateWidget,
  onCopyWidget,
  onBringToFront,
  onSendToBack,
  className,
}: WidgetActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Ações do widget"
        title="Ações do widget"
        className={
          className ??
          "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer dark:hover:bg-muted"
        }
        onClick={(e) => e.stopPropagation()}
      >
        <MoreVertical size={14} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onConfigure && (
          <DropdownMenuItem onClick={() => onConfigure(widgetId)}>
            <SlidersHorizontal size={14} />
            Configurar
          </DropdownMenuItem>
        )}
        {onDuplicateWidget && (
          <DropdownMenuItem onClick={() => onDuplicateWidget(widgetId)}>
            <Copy size={14} />
            Duplicar
          </DropdownMenuItem>
        )}
        {onCopyWidget && (
          <DropdownMenuItem onClick={() => onCopyWidget(widgetId)}>
            <Copy size={14} />
            Copiar
          </DropdownMenuItem>
        )}
        {onBringToFront && (
          <DropdownMenuItem onClick={() => onBringToFront(widgetId)}>
            <ArrowUp size={14} />
            Trazer para frente
          </DropdownMenuItem>
        )}
        {onSendToBack && (
          <DropdownMenuItem onClick={() => onSendToBack(widgetId)}>
            <ArrowDown size={14} />
            Enviar para trás
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => onRemove(widgetId)}>
          <Trash2 size={14} />
          Remover
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface DashboardWidgetViewProps {
  widget: DashboardWidget
  filters: DashboardFilter[]
  filterValues: Record<string, string | string[]>
  onRemove: (widgetId: string) => void
  onConfigure?: (widgetId: string) => void
  onDuplicateWidget?: (widgetId: string) => void
  onCopyWidget?: (widgetId: string) => void
  onBringToFront?: (widgetId: string) => void
  onSendToBack?: (widgetId: string) => void
  readOnly?: boolean
  /** Quando true, usa endpoints públicos (sem auth) para buscar dados. */
  publicMode?: boolean
  distinctValues?: Record<string, string[]>
  loadingDistinct?: boolean
  onFilterValueChange?: (filterId: string, value: string | string[]) => void
}

function buildFilterClauses(
  filters: DashboardFilter[],
  filterValues: Record<string, string | string[]>,
  analysis: Analysis
): FilterClause[] {
  return filters
    .filter((f) => {
      if (analysis.datasetId != null && analysis.datasetId !== f.datasetId) return false
      if (f.scope === "dashboard") return true
      return f.scope.includes(analysis.id)
    })
    .map((f) => {
      const rawValue = filterValues[f.id] ?? f.defaultValue
      if (rawValue === null || rawValue === undefined) return null
      if (Array.isArray(rawValue) && rawValue.length === 0) return null
      if (typeof rawValue === "string" && rawValue === "") return null

      let values: string | string[]
      if (f.operator === "in") {
        values = Array.isArray(rawValue) ? rawValue : [rawValue]
      } else if (f.operator === "between") {
        values = Array.isArray(rawValue) ? rawValue : [rawValue]
      } else {
        values = typeof rawValue === "string" ? rawValue : rawValue[0] ?? ""
      }

      return { column: f.column, operator: f.operator, values }
    })
    .filter((f): f is FilterClause => f !== null)
}

export function DashboardWidgetView({
  widget,
  filters,
  filterValues,
  onRemove,
  onConfigure,
  onDuplicateWidget,
  onCopyWidget,
  onBringToFront,
  onSendToBack,
  readOnly = false,
  publicMode = false,
  distinctValues = {},
  loadingDistinct = false,
  onFilterValueChange,
}: DashboardWidgetViewProps) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  // loading: buscando · ready: renderiza · missing: análise não existe (remove)
  //         · error: falha de rede/contrato (mantém o widget, sem remover)
  const [analysisState, setAnalysisState] = useState<
    "loading" | "ready" | "missing" | "error"
  >(() => widget.analysisId ? "loading" : "ready")
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [analysisReload, setAnalysisReload] = useState(0)
  const [data, setData] = useState<Record<string, unknown>[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  // Widgets estáticos (texto/imagem) não dependem da consulta da análise;
  // sem config explícita, o comportamento é o legado (sempre consulta).
  const configWithoutAnalysis = widget.config
  const needsData = !configWithoutAnalysis ||
    configWithoutAnalysis.type === "table" || configWithoutAnalysis.type === "kpi" ||
    isChartWidgetConfig(configWithoutAnalysis)

  const fetchQuery = useCallback(
    async (sql: string, databaseId: number, dbSchema: string | null) => {
      setLoading(true)
      setError(null)

      try {
        let response
        if (publicMode) {
            if (!widget.analysisId) throw new Error("Widget sem análise não pode executar consulta pública.")
          // Modo público: backend deriva SQL/database da análise salva.
          const filterClauses =
            filters.length > 0 && analysis
              ? buildFilterClauses(filters, filterValues, analysis)
              : []
          response = await executePublicQuery({
            analysis_id: widget.analysisId,
            ...(filterClauses.length > 0 ? { filters: filterClauses } : {}),
          })
        } else if (filters.length > 0 && analysis) {
          const filterClauses = buildFilterClauses(filters, filterValues, analysis)
          if (filterClauses.length > 0) {
            response = await executeQueryFiltered({
              database_id: databaseId,
              sql,
              db_schema: dbSchema ?? undefined,
              filters: filterClauses,
            })
          } else {
            response = await executeQuery({
              database_id: databaseId,
              sql,
              db_schema: dbSchema ?? undefined,
            })
          }
        } else {
          response = await executeQuery({
            database_id: databaseId,
            sql,
            db_schema: dbSchema ?? undefined,
          })
        }

        if (!mountedRef.current) return

        if (response.status === "error") {
          setError(response.message || "Erro ao executar a consulta.")
        } else {
          setData(response.data ?? [])
        }
      } catch (err) {
        if (!mountedRef.current) return

        const msg =
          err instanceof ApiError
            ? err.detail
            : "Não foi possível executar a consulta."
        setError(msg)
      } finally {
        if (mountedRef.current) {
          setLoading(false)
        }
      }
    },
    [filters, filterValues, analysis, publicMode, widget.analysisId]
  )

  const fetchQueryRef = useRef(fetchQuery)
  useEffect(() => {
    fetchQueryRef.current = fetchQuery
  })

  useEffect(() => {
    mountedRef.current = true
    let cancelled = false

    async function load() {
      if (!widget.analysisId) {
        return
      }
      // Modo público: usa os dados inline da análise (sem chamada autenticada)
      if (publicMode && widget.analysisData) {
        const ad = widget.analysisData
        const loaded: Analysis = {
          id: ad.id,
          name: ad.name,
          description: "",
          sql: ad.sql ?? "",
          databaseId: ad.databaseId ?? 0,
          dbSchema: ad.dbSchema ?? null,
          datasetId: null,
          chartType: assertChartType(ad.chartType),
          dimension: ad.dimension ?? null,
          metric: ad.metric ?? null,
          chartConfig: null,
          projectId: null,
          createdAt: "",
          updatedAt: "",
        }
        if (!mountedRef.current) return
        requestAnimationFrame(() => {
          if (!mountedRef.current) return
          setAnalysis(loaded)
          setAnalysisState(loaded ? "ready" : "missing")
          setAnalysisError(null)
          if (needsData && loaded.databaseId && loaded.sql) {
            fetchQueryRef.current(loaded.sql, loaded.databaseId, loaded.dbSchema)
          }
        })
        return
      }

      try {
        const loaded = await getAnalysis(widget.analysisId)
        if (cancelled || !mountedRef.current) return

        requestAnimationFrame(() => {
          if (!mountedRef.current) return
          setAnalysis(loaded)
          setAnalysisState(loaded ? "ready" : "missing")
          setAnalysisError(null)

          if (needsData && loaded?.databaseId && loaded.sql) {
            fetchQueryRef.current(loaded.sql, loaded.databaseId, loaded.dbSchema)
          }
        })
      } catch (err) {
        if (cancelled || !mountedRef.current) return

        requestAnimationFrame(() => {
          if (!mountedRef.current) return
          setAnalysis(null)
          if (err instanceof ApiError && err.status === 404) {
            setAnalysisState("missing")
          } else {
            setAnalysisError(
              err instanceof ApiError
                ? err.detail
                : "Erro ao carregar a análise."
            )
            setAnalysisState("error")
          }
        })
      }
    }

    load()

    return () => {
      cancelled = true
      mountedRef.current = false
    }
  }, [widget.analysisId, widget.analysisData, analysisReload, needsData, publicMode])

  // só remove o widget quando a análise realmente não existe (404/ausente);
  // falhas de rede/contrato caem em "error" e preservam o widget
  useEffect(() => {
    if (analysisState === "missing") {
      onRemove(widget.id)
    }
  }, [analysisState, onRemove, widget.id])

  useEffect(() => {
    if (
      needsData &&
      analysisState === "ready" &&
      analysis?.databaseId &&
      analysis.sql
    ) {
      requestAnimationFrame(() => {
        fetchQueryRef.current(analysis.sql, analysis.databaseId, analysis.dbSchema)
      })
    }
  }, [filterValues, analysisState, analysis, needsData])

  if (analysisState === "loading" || analysisState === "missing") {
    return null
  }

  if (analysisState === "error") {
    return (
      <div className="flex h-full flex-col rounded-lg border border-border bg-card overflow-hidden dark:border-border dark:bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5 dark:border-border">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle
              size={15}
              className="shrink-0 text-destructive dark:text-destructive"
            />
            <h3 className="truncate text-sm font-semibold text-foreground dark:text-foreground">
              Análise indisponível
            </h3>
          </div>

          {!readOnly && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer dark:hover:bg-muted"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical size={14} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onRemove(widget.id)}>
                  <Trash2 size={14} />
                  Remover
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4">
          <p className="text-center text-sm text-destructive dark:text-destructive">
            {analysisError ?? "Erro ao carregar a análise."}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setAnalysisError(null)
              setAnalysisState("loading")
              setAnalysisReload((tick) => tick + 1)
            }}
          >
            <RefreshCw size={13} />
            Tentar novamente
          </Button>
        </div>
      </div>
    )
  }

  if (!analysis && !widget.config) {
    return null
  }

  const config = widget.config ?? legacyToWidgetConfig(analysis!)
  const title = config.title || analysis?.name || ""
  const style: CSSProperties = {
    ...(config.style?.backgroundColor ? { backgroundColor: config.style.backgroundColor } : {}),
    ...(config.style?.borderColor ? { borderColor: config.style.borderColor } : {}),
    ...(config.style?.borderWidth !== undefined ? { borderWidth: config.style.borderWidth } : {}),
    ...(config.style?.borderRadius !== undefined ? { borderRadius: config.style.borderRadius } : {}),
    ...(config.style?.opacity !== undefined ? { opacity: config.style.opacity } : {}),
    ...(config.style?.zIndex !== undefined ? { zIndex: config.style.zIndex } : {}),
    ...(config.style?.visible === false ? { display: "none" } : {}),
    ...(config.style?.shadow === "sm" ? { boxShadow: "0 1px 2px rgb(0 0 0 / 0.12)" } : {}),
    ...(config.style?.shadow === "md" ? { boxShadow: "0 4px 10px rgb(0 0 0 / 0.16)" } : {}),
  }

  // Filtros no canvas: compactos, sem cabeçalho genérico de card. O controle
  // e o rótulo da coluna ficam em uma linha; ações de edição são overlay.
  if (config.type === "filter") {
    const filter = filters.find((item) => item.id === config.filterId)
    return (
      <div
        className="group relative h-full overflow-hidden rounded-lg border border-border bg-card dark:border-border dark:bg-card"
        style={style}
      >
        {!readOnly && (
          <div className="pointer-events-none absolute right-1 top-1 z-10 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
            <WidgetActionsMenu
              widgetId={widget.id}
              onRemove={onRemove}
              onConfigure={onConfigure}
              onDuplicateWidget={onDuplicateWidget}
              onCopyWidget={onCopyWidget}
              onBringToFront={onBringToFront}
              onSendToBack={onSendToBack}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-background/80 text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground cursor-pointer dark:bg-background/80 dark:hover:bg-muted"
            />
          </div>
        )}
        <div className="flex h-full min-w-0 flex-col justify-center gap-1.5 px-3 py-2">
          <div className="flex min-w-0 items-center gap-1.5 pr-7">
            <SlidersHorizontal size={13} className="shrink-0 text-primary dark:text-primary" />
            <h3 className="truncate text-xs font-semibold text-foreground dark:text-foreground">
              {title || filter?.column || "Filtro"}
            </h3>
          </div>
          <div className="min-w-0">
            {!filter || !onFilterValueChange ? (
              <p className="text-xs text-muted-foreground">Filtro não configurado.</p>
            ) : (
              <DashboardFilterControl
                filter={filter}
                value={filterValues[filter.id] ?? filter.defaultValue}
                values={distinctValues[filter.id] ?? []}
                loading={loadingDistinct}
                onChange={(value) => onFilterValueChange(filter.id, value)}
                compact
              />
            )}
          </div>
        </div>
      </div>
    )
  }

  // Elementos apresentacionais (texto/forma/imagem): direto no canvas,
  // sem card, header ou padding. Ações de edição viram overlay no hover.
  if (isPresentationWidget(config)) {
    return (
      <div className="group relative h-full" style={presentationStyle(config)}>
        {!readOnly && (
          <div className="pointer-events-none absolute right-1 top-1 z-10 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
            <WidgetActionsMenu
              widgetId={widget.id}
              onRemove={onRemove}
              onConfigure={onConfigure}
              onDuplicateWidget={onDuplicateWidget}
              onCopyWidget={onCopyWidget}
              onBringToFront={onBringToFront}
              onSendToBack={onSendToBack}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-background/80 text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground cursor-pointer dark:bg-background/80 dark:hover:bg-muted"
            />
          </div>
        )}

        {config.type === "text" && (
          <p
            className="h-full whitespace-pre-wrap text-foreground dark:text-foreground"
            style={{
              fontFamily: config.fontFamily ?? undefined,
              fontSize: config.fontSize ?? 14,
              fontWeight: config.fontWeight ?? 400,
              color: config.color ?? "",
              textAlign: config.alignment ?? "left",
            }}
          >
            {config.content}
          </p>
        )}

        {config.type === "image" &&
          (config.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={config.src}
              alt={config.alt ?? ""}
              className="h-full w-full"
              style={{
                objectFit: config.fit ?? "contain",
                objectPosition: config.objectPosition ?? "center",
                aspectRatio: config.aspectRatio,
                borderRadius: config.style?.borderRadius,
              }}
            />
          ) : (
            <p className="flex h-full items-center justify-center text-center text-sm text-muted-foreground dark:text-muted-foreground">
              Imagem sem URL.
            </p>
          ))}

        {config.type === "shape" &&
          (config.shape === "line" || config.shape === "divider" ? (
            <div className="flex h-full w-full items-center">
              <ShapeView config={config} />
            </div>
          ) : (
            <ShapeView config={config} />
          ))}
      </div>
    )
  }

  const Icon = isChartType(config.type)
    ? CHART_TYPE_META[config.type].icon
    : config.type === "custom-html"
      ? Shapes
      : STATIC_ICONS[config.type as StaticWidgetType]

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-card overflow-hidden dark:border-border dark:bg-card" style={style}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5 dark:border-border">
        <div className="flex items-center gap-2 min-w-0">
          <Icon size={15} className="shrink-0 text-primary dark:text-primary" />
          <h3 className="truncate text-sm font-semibold text-foreground dark:text-foreground">
            {title}
          </h3>
        </div>

        <div className="flex items-center gap-1">
          {analysis && !loading && !error && data && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() =>
                fetchQuery(analysis.sql, analysis.databaseId, analysis.dbSchema)
              }
              className="h-7 w-7 text-muted-foreground hover:text-foreground dark:hover:text-foreground"
              title="Atualizar dados"
            >
              <RefreshCw size={13} />
            </Button>
          )}

          {!readOnly && (
            <WidgetActionsMenu
              widgetId={widget.id}
              onRemove={onRemove}
              onConfigure={onConfigure}
              onDuplicateWidget={onDuplicateWidget}
              onCopyWidget={onCopyWidget}
              onBringToFront={onBringToFront}
              onSendToBack={onSendToBack}
            />
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-4">
        {needsData && loading && (
          <div className="flex h-full items-center justify-center">
            <div className="flex items-center gap-2 text-sm text-muted-foreground dark:text-muted-foreground">
              <Loader2 size={16} className="animate-spin" />
              Carregando dados...
            </div>
          </div>
        )}

        {needsData && error && (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 dark:bg-destructive/20">
              <AlertCircle size={18} className="text-destructive" />
            </div>
            <p className="text-center text-sm text-destructive dark:text-destructive">
              {error}
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={!analysis}
              onClick={() =>
                analysis && fetchQuery(analysis.sql, analysis.databaseId, analysis.dbSchema)
              }
            >
              <RefreshCw size={13} />
              Tentar novamente
            </Button>
          </div>
        )}

        {!needsData && config.type === "custom-html" && (
          <div className="flex h-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-muted/50 p-4 text-center">
            <Shapes size={18} className="text-muted-foreground" />
            <p className="text-xs font-medium text-foreground">
              {config.title || "Conteúdo personalizado"}
            </p>
            <p className="text-xs text-muted-foreground">
              HTML personalizado habilitado na próxima etapa — nenhum conteúdo
              é executado neste modo.
            </p>
          </div>
        )}

        {needsData && !loading && !error && data && data.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground dark:text-muted-foreground">
              Nenhum dado retornado.
            </p>
          </div>
        )}

        {needsData && !loading && !error && data && data.length > 0 && (
          <>
            {config.type === "table" && (
              <div className="max-h-full overflow-auto rounded-lg border border-border dark:border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b-2 border-b-border hover:bg-muted/50 dark:border-b-border dark:hover:bg-muted">
                      {Object.keys(data[0] ?? {}).map((col) => (
                        <TableHead
                          key={col}
                          className="bg-muted/50 text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:bg-muted dark:text-muted-foreground"
                        >
                          {col}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.slice(0, config.limit ?? 50).map((row, i) => (
                      <TableRow
                        key={i}
                        className="even:bg-muted/50/50 dark:even:bg-muted/50"
                      >
                        {Object.keys(data[0] ?? {}).map((col) => (
                          <TableCell
                            key={col}
                            className="px-3 py-2 text-xs text-foreground dark:text-foreground"
                          >
                            {row[col] === null || row[col] === undefined
                              ? "—"
                              : String(row[col])}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {config.type === "kpi" && (
              <div className="flex h-full flex-col items-center justify-center gap-1">
                <span className="text-2xl font-semibold text-foreground">
                  {formatKpi(kpiValue(data, config), config.numberFormat)}
                </span>
              </div>
            )}

            {isChartWidgetConfig(config) && (
              <div className="h-full min-h-[200px]">
                <EChartRenderer config={config} rows={data} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function ShapeView({ config }: { config: ShapeConfig }) {
  const shapeClass = config.shape === "circle"
    ? "rounded-full"
    : config.shape === "line" || config.shape === "divider"
      ? "h-px w-full"
      : "h-full w-full rounded-sm"
  return (
    <div
      aria-label={config.title ?? config.shape}
      className={shapeClass}
      style={{
        backgroundColor: config.fill ?? (config.shape === "line" || config.shape === "divider" ? "transparent" : "#e2e8f0"),
        borderColor: config.stroke ?? "#64748b",
        borderWidth: config.strokeWidth ?? 1,
        borderStyle: "solid",
      }}
    />
  )
}

function DashboardFilterControl({
  filter,
  value,
  values,
  loading,
  onChange,
  compact = false,
}: {
  filter: DashboardFilter
  value: string | string[]
  values: string[]
  loading: boolean
  onChange: (value: string | string[]) => void
  compact?: boolean
}) {
  const controlClass = compact
    ? "h-7 w-full rounded-md border border-border bg-background px-1.5 text-xs"
    : "h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
  // Derived options: include already-selected values + visible distinct options,
  // avoiding duplicates. This ensures options persist across filter changes.
  const [queryState, setQueryState] = useState<{ filterId: string; text: string }>({
    filterId: "",
    text: "",
  })
  const query = queryState.filterId === filter.id ? queryState.text : ""
  const setQuery = (text: string) => setQueryState({ filterId: filter.id, text })
  const selectedMulti = Array.isArray(value) ? value : value ? [value] : []
  const withSelected = [
    ...values,
    ...selectedMulti.filter((item) => !values.includes(item)),
  ]
  const visibleOptions = withSelected.filter(
    (item) => !query || optionMatches(query, item) || selectedMulti.includes(item)
  )

  const optionMatches = (query: string, item: string) =>
    item.toString().toLowerCase().includes(query.toLowerCase())
  if (filter.controlType === "date-range" || filter.operator === "between") {
    const range = Array.isArray(value) ? value : ["", ""]
    return (
      <div className="flex items-center gap-2">
        <input aria-label={`${filter.column} início`} type="date" value={range[0] ?? ""} onChange={(event) => onChange([event.target.value, range[1] ?? ""])} className={controlClass} />
        <input aria-label={`${filter.column} fim`} type="date" value={range[1] ?? ""} onChange={(event) => onChange([range[0] ?? "", event.target.value])} className={controlClass} />
      </div>
    )
  }
  if (filter.controlType === "list" && visibleOptions.length > 0) {
    const selected = typeof value === "string" ? value : value[0] ?? ""
    return (
      <div role="radiogroup" aria-label={filter.column} className="space-y-1 overflow-y-auto">
        <label className="flex items-center gap-2 text-xs"><input type="radio" name={filter.id} checked={!selected} onChange={() => onChange("")} />Todos</label>
        {visibleOptions.map((item) => <label key={item} className="flex items-center gap-2 text-xs"><input type="radio" name={filter.id} value={item} checked={selected === item} onChange={() => onChange(item)} />{item}</label>)}
      </div>
    )
  }
  if (filter.controlType === "multi-select" || filter.operator === "in") {
    const selected = Array.isArray(value) ? value : []
    if (visibleOptions.length === 0) {
      return <div className="space-y-1">
        <select aria-label={filter.column} multiple disabled className={controlClass}>
          <option>Nenhuma opção disponível</option>
        </select>
      </div>
    }
    return (
      <div className="space-y-1">
        <select aria-label={filter.column} multiple value={selected} onChange={(event) => onChange(Array.from(event.target.selectedOptions, (option) => option.value))} className={`${controlClass} ${compact ? "h-14" : "h-24"}`}>
          {visibleOptions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
    )
  }
  if (visibleOptions.length === 0) {
    return <input aria-label={filter.column} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} placeholder="Valor do filtro" className={controlClass} />
  }
  return (
    <select aria-label={filter.column} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} className={controlClass}>
      <option value="">Todos</option>
      {visibleOptions.map((item) => <option key={item} value={item}>{item}</option>)}
    </select>
  )
}
