import { suggestViz } from "./suggest-viz"
import { displayQuestion } from "./chat-context"
import type { VisualizationType } from "@/lib/types/charts"
import type { ChartDisplayOptions } from "@/lib/charts/display-options"
import { DEFAULT_DISPLAY_OPTIONS } from "@/lib/charts/display-options"
import type { Investigation } from "@/hooks/use-explorer-agent"
import type { DatasetListItem } from "@/lib/api/datasets"

/** Origem explícita do resultado — nunca inferir por question/insight. */
export type WorkspaceSource = "agent" | "sql"

export interface WorkspaceData {
  rows: Record<string, unknown>[]
  rowCount: number
  truncated: boolean
  executionMs?: number
  sql: string | null
  question?: string | null
  insight?: string | null
  source: WorkspaceSource
  /** Para ações (salvar/publicar) e subtítulo do resultado. */
  databaseId?: number | null
  dbSchema?: string | null
  datasetId?: number | null
  datasetName?: string | null
  /** Id da investigação do agente (para confirmar create_analysis). */
  investigationId?: string | null
  savedAnalysis?: { analysisId: string; name: string } | null
}

export type PresentationViewMode = "table" | "chart"

export interface PresentationState {
  chartType: VisualizationType
  dimension: string | null
  metric: string | null
  colorField: string | null
  display: ChartDisplayOptions
  viewMode: PresentationViewMode
}

/** Apresentação inicial a partir das linhas (heurística do AgentViz). */export function presentationFromRows(
  rows: Record<string, unknown>[]
): PresentationState {
  const suggestion = suggestViz(rows)
  const hasPlot =
    (suggestion.dimension && suggestion.metric) ||
    suggestion.chartType === "kpi"
  return {
    chartType: suggestion.chartType,
    dimension: suggestion.dimension,
    metric: suggestion.metric,
    colorField: null,
    display: DEFAULT_DISPLAY_OPTIONS,
    viewMode: hasPlot ? "chart" : "table",
  }
}

export interface HistoryEntry {
  id: string
  question: string
  datasetId: number
  datasetName: string
  at: number
  status: "streaming" | "awaiting_confirmation" | "done" | "error"
  hasResult: boolean
}

export interface HistoryGroup {
  label: string
  entries: HistoryEntry[]
}

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function formatDay(timestamp: number): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(timestamp))
}

/** Agrupa investigações por dia (Hoje / Ontem / data), mais recentes primeiro. */
export function groupHistoryByDay(entries: HistoryEntry[]): HistoryGroup[] {
  const sorted = [...entries].sort((a, b) => b.at - a.at)
  const today = startOfDay(Date.now())
  const groups = new Map<string, HistoryEntry[]>()
  const order: string[] = []

  for (const entry of sorted) {
    const day = startOfDay(entry.at)
    const diffDays = Math.round((today - day) / 86_400_000)
    const label =
      diffDays <= 0 ? "Hoje" : diffDays === 1 ? "Ontem" : formatDay(entry.at)
    if (!groups.has(label)) {
      groups.set(label, [])
      order.push(label)
    }
    groups.get(label)?.push(entry)
  }

  return order.map((label) => ({
    label,
    entries: groups.get(label) ?? [],
  }))
}

/**
 * Deriva o WorkspaceData de uma investigação do agente (um turno da
 * conversa). A pergunta exibida usa displayQuestion (sem o contexto
 * injetado). databaseId/dbSchema vêm do dataset selecionado, quando
 * conhecido — sem eles, salvar/publicar ficam indisponíveis no turno.
 */
export function workspaceFromInvestigation(
  inv: Investigation,
  dataset: DatasetListItem | null
): WorkspaceData {
  const queryData = inv.queryData
  return {
    rows: queryData?.rows ?? [],
    rowCount: queryData?.rowCount ?? 0,
    truncated: queryData?.truncated ?? false,
    executionMs: queryData?.executionMs,
    sql: inv.sql,
    question: displayQuestion(inv.question),
    insight: inv.insight || null,
    source: "agent",
    databaseId: dataset?.database.id ?? null,
    dbSchema: dataset?.schema ?? null,
    datasetId: inv.datasetId,
    datasetName: inv.datasetName,
    investigationId: inv.id,
    savedAnalysis: inv.savedAnalysis,
  }
}
