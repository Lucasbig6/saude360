import type { ExplorerQueryData } from "@/hooks/use-explorer-agent"
import type { AnalysisFilter, ChartNumberFormat } from "@/lib/charts/chart-config"
import { isChartNumberFormat, isChartType } from "@/lib/charts/chart-config"
import type { ChartDisplayOptions } from "@/lib/charts/display-options"
import type { VisualizationType } from "@/lib/types/charts"
import {
  presentationFromRows,
  type PresentationState,
  type WorkspaceData,
  type WorkspaceSource,
} from "./workspace"

/** Ordenação exibida/persistida da análise em edição. */
export interface PreviewSort {
  field: string
  direction: "asc" | "desc"
}

/**
 * Contrato estruturado agente → frontend (tool `preview_analysis`).
 * É a fonte da verdade do painel de pré-visualização: a configuração
 * completa da análise em edição, preservada entre pedidos consecutivos.
 */
export interface PreviewConfig {
  sql: string
  chartType: VisualizationType
  dimension: string | null
  metric: string | null
  colorField: string | null
  sort: PreviewSort | null
  limit: number | null
  filters: AnalysisFilter[]
  /** Rótulos de valor nas barras — null = manter os atuais. */
  showValues: boolean | null
  /** Formatação dos números (moeda/percent/compact) — null = manter a atual. */
  numberFormat: ChartNumberFormat | null
}

/** Contexto do resultado (ações salvar/publicar, subtítulo, insight). */
export interface DraftMeta {
  question?: string | null
  insight?: string | null
  source: WorkspaceSource
  databaseId?: number | null
  dbSchema?: string | null
  datasetId?: number | null
  datasetName?: string | null
  investigationId?: string | null
  savedAnalysis?: { analysisId: string; name: string } | null
}

/**
 * Estado único da análise em edição — fonte de verdade do painel de
 * pré-visualização, da aba SQL/Visual e do salvamento. Todas as transições
 * passam pelo reducer (escritor único): chat, gráfico, tabela e análise
 * salva nunca divergem.
 */
export interface AnalysisDraft {
  /** Identidade da análise salva em edição — preservada entre pedidos. */
  analysisId: string | null
  /** SQL executável da análise em edição. */
  sql: string | null
  /** Contrato estruturado do agente (quando houver). */
  config: PreviewConfig | null
  presentation: PresentationState
  /** Dados da última execução válida — nunca zerados por erro/streaming. */
  data: ExplorerQueryData | null
  meta: DraftMeta | null
  /** Execução de consulta em andamento (caminho SQL autorizado). */
  executing: boolean
  /** Erro da última execução — o dado anterior é preservado. */
  error: string | null
}

export type DraftAction =
  | { type: "reset" }
  | {
      type: "preview"
      config: PreviewConfig
      data: ExplorerQueryData
      meta: DraftMeta
    }
  | {
      type: "result"
      data: ExplorerQueryData
      sql: string | null
      meta: DraftMeta
    }
  | {
      type: "restore"
      analysisId: string
      config: PreviewConfig
      presentation: PresentationState
      meta: DraftMeta
    }
  | { type: "patch-presentation"; presentation: PresentationState }
  | { type: "meta"; meta: Partial<DraftMeta> }
  | { type: "saved"; analysisId: string }
  | { type: "running" }
  | { type: "clear-error" }
  | { type: "error"; message: string }

// ---------------------------------------------------------------------------
// Normalização do contrato (tool_result / análise salva)
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> {
  return (value ?? {}) as Record<string, unknown>
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null
}

function normalizeChartType(value: unknown): VisualizationType {
  if (typeof value === "string" && value === "kpi") return "kpi"
  if (isChartType(value)) return value
  return "bar"
}

function normalizeSort(value: unknown): PreviewSort | null {
  if (!value || typeof value !== "object") return null
  const record = asRecord(value)
  const field = optionalString(record.field)
  if (!field) return null
  if (record.direction !== "asc" && record.direction !== "desc") return null
  return { field, direction: record.direction }
}

function normalizeLimit(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value)
  }
  return null
}

function normalizeFilters(value: unknown): AnalysisFilter[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is AnalysisFilter => {
      if (!item || typeof item !== "object") return false
      const record = asRecord(item)
      return (
        typeof record.field === "string" &&
        record.field.trim() !== "" &&
        typeof record.operator === "string" &&
        record.operator.trim() !== ""
      )
    })
    .slice(0, 20)
    .map((item) => ({
      field: item.field,
      operator: item.operator,
      ...(item.value !== undefined ? { value: item.value } : {}),
    }))
}

/**
 * Valida a config vinda do tool_result de `preview_analysis`. Só a SQL é
 * obrigatória — campos inválidos são normalizados para o padrão seguro em
 * vez de derrubar a pré-visualização inteira.
 */
export function normalizePreviewConfig(raw: unknown): PreviewConfig | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const record = asRecord(raw)
  const sql = typeof record.sql === "string" ? record.sql.trim() : ""
  if (!sql) return null
  return {
    sql,
    chartType: normalizeChartType(record.chartType),
    dimension: optionalString(record.dimension),
    metric: optionalString(record.metric),
    colorField: optionalString(record.colorField),
    sort: normalizeSort(record.sort),
    limit: normalizeLimit(record.limit),
    filters: normalizeFilters(record.filters),
    showValues:
      typeof record.showValues === "boolean" ? record.showValues : null,
    numberFormat: isChartNumberFormat(record.numberFormat)
      ? record.numberFormat
      : null,
  }
}

// ---------------------------------------------------------------------------
// Projeções (props dos componentes existentes permanecem válidas)
// ---------------------------------------------------------------------------

export function createEmptyDraft(): AnalysisDraft {
  return {
    analysisId: null,
    sql: null,
    config: null,
    presentation: presentationFromRows([]),
    data: null,
    meta: null,
    executing: false,
    error: null,
  }
}

/** WorkspaceData das abas/ação — projeção do draft (nunca contradiz). */
export function workspaceFromDraft(draft: AnalysisDraft): WorkspaceData | null {
  if (!draft.meta && draft.sql === null && draft.data === null) return null
  return {
    rows: draft.data?.rows ?? [],
    rowCount: draft.data?.rowCount ?? 0,
    truncated: draft.data?.truncated ?? false,
    executionMs: draft.data?.executionMs,
    sql: draft.sql,
    question: draft.meta?.question ?? null,
    insight: draft.meta?.insight ?? null,
    source: draft.meta?.source ?? "sql",
    databaseId: draft.meta?.databaseId ?? null,
    dbSchema: draft.meta?.dbSchema ?? null,
    datasetId: draft.meta?.datasetId ?? null,
    datasetName: draft.meta?.datasetName ?? null,
    investigationId: draft.meta?.investigationId ?? null,
    savedAnalysis: draft.meta?.savedAnalysis ?? null,
  }
}

/** Apresentação controlada (AgentViz / aba Visual / payload de salvamento). */
export function presentationFromDraft(draft: AnalysisDraft): PresentationState {
  return draft.presentation
}

// ---------------------------------------------------------------------------
// Derivações internas
// ---------------------------------------------------------------------------

function canPlot(presentation: PresentationState): boolean {
  if (presentation.chartType === "kpi") return presentation.metric !== null
  return presentation.dimension !== null && presentation.metric !== null
}

/**
 * Aplica a config do agente à apresentação preservando o que a config não
 * define (títulos, paleta...) e a escolha de modo do usuário quando já havia
 * resultado — o contrato estruturado manda em dimensão/métrica/cor/ordem/
 * limite/filtros; o resto é estado de apresentação.
 */
function presentationFromPreview(
  config: PreviewConfig,
  previous: PresentationState,
  hadData: boolean
): PresentationState {
  const display: ChartDisplayOptions = {
    ...previous.display,
    sortField: config.sort?.field ?? null,
    sortDirection: config.sort?.direction ?? previous.display.sortDirection,
    limit: config.limit,
    showValues: config.showValues ?? previous.display.showValues,
    numberFormat: config.numberFormat ?? previous.display.numberFormat,
  }
  const presentation: PresentationState = {
    chartType: config.chartType,
    dimension: config.dimension,
    metric: config.metric,
    colorField: config.colorField,
    display,
    viewMode: previous.viewMode,
    filters: config.filters,
  }
  if (!canPlot(presentation)) {
    presentation.viewMode = "table"
  } else if (!hadData) {
    presentation.viewMode = "chart"
  }
  return presentation
}

/**
 * Reconcilia dimensão/métrica/cor/ordenação com as colunas reais do novo
 * resultado (SQL manual/execução do agente): campo que não existe mais é
 * limpo em vez de quebrar o gráfico.
 */
function reconcilePresentation(
  presentation: PresentationState,
  columns: string[]
): PresentationState {
  const available = new Set(columns)
  const dimension =
    presentation.dimension && !available.has(presentation.dimension)
      ? null
      : presentation.dimension
  const metric =
    presentation.metric && !available.has(presentation.metric)
      ? null
      : presentation.metric
  const colorField =
    presentation.colorField && !available.has(presentation.colorField)
      ? null
      : presentation.colorField
  const sortField =
    presentation.display.sortField && !available.has(presentation.display.sortField)
      ? null
      : presentation.display.sortField
  const next: PresentationState = {
    ...presentation,
    dimension,
    metric,
    colorField,
    display: {
      ...presentation.display,
      sortField,
      limit: presentation.display.limit,
    },
  }
  if (!canPlot(next)) next.viewMode = "table"
  return next
}

/** Espelha a apresentação na config (a aba Visual/AgentViz também edita). */
function syncConfig(
  draft: AnalysisDraft,
  presentation: PresentationState
): PreviewConfig | null {
  return configFromPresentation(
    presentation,
    draft.sql ?? draft.config?.sql ?? ""
  )
}

/**
 * Config estruturada derivada da apresentação controlada — garante que
 * visualização, aba SQL e payload de salvamento nunca divergam.
 */
export function configFromPresentation(
  presentation: PresentationState,
  sql: string
): PreviewConfig {
  return {
    sql,
    chartType: presentation.chartType,
    dimension: presentation.dimension,
    metric: presentation.metric,
    colorField: presentation.colorField,
    sort: presentation.display.sortField
      ? {
          field: presentation.display.sortField,
          direction: presentation.display.sortDirection,
        }
      : null,
    limit: presentation.display.limit,
    filters: presentation.filters,
    showValues: presentation.display.showValues,
    numberFormat: presentation.display.numberFormat,
  }
}

function mergeMeta(
  current: DraftMeta | null,
  next: Partial<DraftMeta>
): DraftMeta | null {
  if (!current) {
    return next.source ? ({ ...next } as DraftMeta) : null
  }
  return { ...current, ...next }
}

function metaEquals(a: DraftMeta | null, b: DraftMeta | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.question === b.question &&
    a.insight === b.insight &&
    a.source === b.source &&
    a.databaseId === b.databaseId &&
    a.dbSchema === b.dbSchema &&
    a.datasetId === b.datasetId &&
    a.datasetName === b.datasetName &&
    a.investigationId === b.investigationId &&
    a.savedAnalysis?.analysisId === b.savedAnalysis?.analysisId &&
    a.savedAnalysis?.name === b.savedAnalysis?.name
  )
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

/**
 * Transições do estado da análise em edição.
 *
 * Garantias de robustez:
 * - `preview`/`result` substituem dado e config de forma atômica;
 * - `error`/`running` preservam a última visualização válida;
 * - `analysisId` sobrevive a todos os pedidos (sem duplicatas ao salvar);
 * - respostas antigas só aplicam se o chamador detectar identidade nova
 *   (o caller guarda a identidade do último dado aplicado).
 */
export function analysisDraftReducer(
  state: AnalysisDraft,
  action: DraftAction
): AnalysisDraft {
  switch (action.type) {
    case "reset":
      return createEmptyDraft()

    case "preview": {
      const presentation = presentationFromPreview(
        action.config,
        state.presentation,
        state.data !== null
      )
      return {
        ...state,
        sql: action.config.sql,
        config: action.config,
        presentation,
        data: action.data,
        meta: mergeMeta(state.meta, action.meta),
        executing: false,
        error: null,
      }
    }

    case "result": {
      // Sem config estruturada (SQL puro / primeiro resultado) re-sugere a
      // visualização a partir das linhas; com config, preserva a análise em
      // edição e só reconcilia o que sumiu das colunas novas.
      const presentation = state.config
        ? reconcilePresentation(state.presentation, action.data.columns)
        : presentationFromRows(action.data.rows)
      const config = state.config
        ? configFromPresentation(
            presentation,
            action.sql ?? state.config.sql
          )
        : null
      return {
        ...state,
        sql: action.sql ?? state.sql,
        config,
        presentation,
        data: action.data,
        meta: mergeMeta(state.meta, action.meta),
        executing: false,
        error: null,
      }
    }

    case "restore": {
      return {
        ...state,
        analysisId: action.analysisId,
        sql: action.config.sql,
        config: action.config,
        presentation: action.presentation,
        data: null,
        meta: action.meta,
        executing: false,
        error: null,
      }
    }

    case "patch-presentation": {
      const presentation = action.presentation
      return {
        ...state,
        presentation,
        config: syncConfig(state, presentation),
      }
    }

    case "meta": {
      const meta = mergeMeta(state.meta, action.meta)
      if (metaEquals(meta, state.meta)) return state
      return { ...state, meta }
    }

    case "saved":
      if (state.analysisId === action.analysisId) return state
      return { ...state, analysisId: action.analysisId }

    case "running":
      if (state.executing && state.error === null) return state
      return { ...state, executing: true, error: null }

    case "clear-error":
      if (state.error === null) return state
      return { ...state, error: null }

    case "error":
      // Nunca apaga data/config/presentation: só registra a falha.
      return { ...state, executing: false, error: action.message }

    default:
      return state
  }
}
