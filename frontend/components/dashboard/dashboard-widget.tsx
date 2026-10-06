"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  AlertCircle,
  Gauge,
  Image as ImageIcon,
  Loader2,
  MoreVertical,
  RefreshCw,
  SlidersHorizontal,
  Table2,
  Trash2,
  Type as TypeIcon,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
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
import { isChartType } from "@/lib/charts/chart-config"
import type { Analysis } from "@/lib/types/analysis"
import type { DashboardFilter, DashboardWidget } from "@/lib/types/dashboard"
import {
  isChartWidgetConfig,
  kpiValue,
  legacyToWidgetConfig,
  type StaticWidgetType,
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
}

const numberFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 })

function formatKpi(value: number | null): string {
  if (value === null) return "—"
  return numberFormat.format(value)
}

interface DashboardWidgetViewProps {
  widget: DashboardWidget
  filters: DashboardFilter[]
  filterValues: Record<string, string | string[]>
  onRemove: (widgetId: string) => void
  onConfigure?: (widgetId: string) => void
  readOnly?: boolean
  /** Quando true, usa endpoints públicos (sem auth) para buscar dados. */
  publicMode?: boolean
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
  readOnly = false,
  publicMode = false,
}: DashboardWidgetViewProps) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  // loading: buscando · ready: renderiza · missing: análise não existe (remove)
  //         · error: falha de rede/contrato (mantém o widget, sem remover)
  const [analysisState, setAnalysisState] = useState<
    "loading" | "ready" | "missing" | "error"
  >("loading")
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [analysisReload, setAnalysisReload] = useState(0)
  const [data, setData] = useState<Record<string, unknown>[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  // Widgets estáticos (texto/imagem) não dependem da consulta da análise;
  // sem config explícita, o comportamento é o legado (sempre consulta).
  const needsData =
    !widget.config ||
    (widget.config.type !== "text" && widget.config.type !== "image")

  const fetchQuery = useCallback(
    async (sql: string, databaseId: number, dbSchema: string | null) => {
      setLoading(true)
      setError(null)

      try {
        let response
        if (publicMode) {
          // Modo público: usa o endpoint sem auth, validado por analysis_id
          const filterClauses =
            filters.length > 0 && analysis
              ? buildFilterClauses(filters, filterValues, analysis)
              : []
          response = await executePublicQuery({
            analysis_id: widget.analysisId,
            database_id: databaseId,
            sql,
            db_schema: dbSchema ?? undefined,
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

  if (!analysis) {
    return null
  }

  const config = widget.config ?? legacyToWidgetConfig(analysis)
  const title = config.title || analysis.name
  const Icon = isChartType(config.type)
    ? CHART_TYPE_META[config.type].icon
    : STATIC_ICONS[config.type]

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-card overflow-hidden dark:border-border dark:bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5 dark:border-border">
        <div className="flex items-center gap-2 min-w-0">
          <Icon size={15} className="shrink-0 text-primary dark:text-primary" />
          <h3 className="truncate text-sm font-semibold text-foreground dark:text-foreground">
            {title}
          </h3>
        </div>

        <div className="flex items-center gap-1">
          {!loading && !error && data && (
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
            <DropdownMenu>
              <DropdownMenuTrigger
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer dark:hover:bg-muted"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical size={14} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onConfigure && (
                  <DropdownMenuItem onClick={() => onConfigure(widget.id)}>
                    <SlidersHorizontal size={14} />
                    Configurar
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => onRemove(widget.id)}>
                  <Trash2 size={14} />
                  Remover
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
              onClick={() =>
                fetchQuery(analysis.sql, analysis.databaseId, analysis.dbSchema)
              }
            >
              <RefreshCw size={13} />
              Tentar novamente
            </Button>
          </div>
        )}

        {!needsData && config.type === "text" && (
          <p className="whitespace-pre-wrap text-sm text-foreground dark:text-foreground">
            {config.content}
          </p>
        )}

        {!needsData && config.type === "image" && (
          config.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={config.src}
              alt={config.alt ?? ""}
              className="mx-auto max-h-full rounded-lg object-contain"
            />
          ) : (
            <p className="text-center text-sm text-muted-foreground dark:text-muted-foreground">
              Imagem sem URL.
            </p>
          )
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
                  {formatKpi(kpiValue(data, config))}
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
