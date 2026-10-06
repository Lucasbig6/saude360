"use client"

import { useEffect, useState } from "react"
import { AlertCircle, BarChart3 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Analysis } from "@/lib/types/analysis"
import { chartTypeIcon, chartTypeLabel } from "@/lib/types/charts"
import {
  isChartWidgetConfig,
  kpiValue,
  legacyToWidgetConfig,
} from "@/lib/types/widgets"
import { executeQuery } from "@/lib/api/queries"
import { EChartRenderer } from "@/components/charts/EChartRenderer"
import type { Row } from "@/lib/charts/transform"

/** Linhas buscadas por miniatura: amostra suficiente para pré-visualizar. */
const THUMB_ROW_LIMIT = 100
/** Máximo de consultas de miniatura em paralelo (evita rajada no banco). */
const MAX_PARALLEL = 3

type ThumbnailState =
  | { status: "loading" }
  | { status: "ready"; rows: Row[] }
  | { status: "empty" }
  | { status: "unavailable" }
  | { status: "error"; message: string }

/** Cache por análise (id + updatedAt): reabrir o drawer não refaz as queries. */
const thumbnailCache = new Map<string, ThumbnailState>()
/** Consultas em andamento (evita fetch duplicado em re-render/StrictMode). */
const inflight = new Map<string, Promise<ThumbnailState>>()

let activeFetches = 0
const pendingJobs: Array<() => void> = []

function pumpQueue() {
  while (activeFetches < MAX_PARALLEL && pendingJobs.length > 0) {
    const job = pendingJobs.shift()
    if (!job) break
    activeFetches += 1
    job()
  }
}

function enqueue(job: () => Promise<void>) {
  pendingJobs.push(() => {
    job()
      .catch(() => {
        // Erros já são capturados dentro do job e viram estado "error".
      })
      .finally(() => {
        activeFetches -= 1
        pumpQueue()
      })
  })
  pumpQueue()
}

/** Invalida o cache (usado pelo botão de reload do drawer). */
export function clearThumbnailCache() {
  thumbnailCache.clear()
}

function thumbKey(analysis: Analysis) {
  return `${analysis.id}:${analysis.updatedAt}`
}

async function fetchRows(analysis: Analysis): Promise<Row[]> {
  const response = await executeQuery({
    database_id: analysis.databaseId,
    sql: analysis.sql,
    db_schema: analysis.dbSchema ?? undefined,
    limit: THUMB_ROW_LIMIT,
  })
  if (response.status === "error") {
    throw new Error(response.message || "Erro ao executar a consulta.")
  }
  return (response.data ?? []) as Row[]
}

/**
 * Garante o estado da miniatura: lê do cache, reutiliza a consulta em
 * andamento ou enfileira uma nova com concorrência limitada.
 */
function loadThumbnail(key: string, analysis: Analysis): Promise<ThumbnailState> {
  const cached = thumbnailCache.get(key)
  if (cached) return Promise.resolve(cached)

  const existing = inflight.get(key)
  if (existing) return existing

  const promise = new Promise<ThumbnailState>((resolve) => {
    enqueue(async () => {
      let result: ThumbnailState
      if (!analysis.sql.trim() || !analysis.databaseId) {
        result = { status: "unavailable" }
      } else {
        try {
          const rows = await fetchRows(analysis)
          result =
            rows.length > 0 ? { status: "ready", rows } : { status: "empty" }
        } catch (err) {
          result = {
            status: "error",
            message: err instanceof Error ? err.message : "Erro ao carregar.",
          }
        }
      }
      thumbnailCache.set(key, result)
      resolve(result)
    })
  })

  inflight.set(key, promise)
  void promise.finally(() => {
    inflight.delete(key)
  })

  return promise
}

export interface AnalysisThumbnailProps {
  analysis: Analysis
  className?: string
}

export function AnalysisThumbnail({ analysis, className }: AnalysisThumbnailProps) {
  const key = thumbKey(analysis)
  const [state, setState] = useState<ThumbnailState>(() => {
    return thumbnailCache.get(key) ?? { status: "loading" }
  })

  useEffect(() => {
    let cancelled = false
    loadThumbnail(key, analysis).then((result) => {
      if (!cancelled) setState(result)
    })
    return () => {
      cancelled = true
    }
  }, [key, analysis])

  return (
    <div
      className={cn(
        "relative flex h-full w-full items-center justify-center overflow-hidden bg-muted/50",
        className
      )}
      data-testid="analysis-thumbnail"
    >
      <ThumbnailContent analysis={analysis} state={state} />
    </div>
  )
}

function ThumbnailContent({
  analysis,
  state,
}: {
  analysis: Analysis
  state: ThumbnailState
}) {
  const Icon = chartTypeIcon[analysis.chartType] ?? BarChart3
  const label = chartTypeLabel[analysis.chartType] ?? "Gráfico"

  if (state.status === "loading") {
    return (
      <div
        className="h-full w-full animate-pulse bg-muted"
        aria-label="Carregando pré-visualização"
      />
    )
  }

  if (state.status === "error" || state.status === "unavailable") {
    return (
      <div className="flex flex-col items-center gap-1 px-3 text-center">
        <AlertCircle size={14} className="text-muted-foreground" />
        <span className="text-xs leading-tight text-muted-foreground">
          {state.status === "error" ? "Sem pré-visualização" : label}
        </span>
      </div>
    )
  }

  if (state.status === "empty") {
    return (
      <div className="flex flex-col items-center gap-1 px-3 text-center">
        <Icon size={14} className="text-muted-foreground" />
        <span className="text-xs leading-tight text-muted-foreground">Sem dados</span>
      </div>
    )
  }

  const config = legacyToWidgetConfig(analysis)

  if (config.type === "table") {
    return <MiniTable rows={state.rows} />
  }

  if (config.type === "kpi") {
    return (
      <span className="text-xl font-semibold text-primary">
        {formatKpi(kpiValue(state.rows, config))}
      </span>
    )
  }

  if (analysis.chartType === "map") {
    return (
      <div className="flex flex-col items-center gap-1 px-3 text-center">
        <Icon size={14} className="text-muted-foreground" />
        <span className="text-xs leading-tight text-muted-foreground">{label}</span>
      </div>
    )
  }

  if (isChartWidgetConfig(config)) {
    return (
      <EChartRenderer
        config={config}
        rows={state.rows}
        animated={false}
        className="h-full w-full"
      />
    )
  }

  return null
}

const numberFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 })

function formatKpi(value: number | null): string {
  if (value === null) return "—"
  return numberFormat.format(value)
}

const MINI_TABLE_ROWS = 5
const MINI_TABLE_COLS = 4

function MiniTable({ rows }: { rows: Row[] }) {
  const columns = Object.keys(rows[0] ?? {}).slice(0, MINI_TABLE_COLS)
  const visibleRows = rows.slice(0, MINI_TABLE_ROWS)

  return (
    <div className="w-full px-2 py-1.5">
      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                className="truncate border-b border-border px-1 pb-1 text-left text-[8px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              {columns.map((col) => (
                <td
                  key={col}
                  className="truncate px-1 py-0.5 text-[9px] text-muted-foreground"
                >
                  {row[col] === null || row[col] === undefined
                    ? "—"
                    : String(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
