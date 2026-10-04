import { ApiError, apiDelete, apiGet, apiPost, apiPut } from "../api"
import { normalizeChartConfig, type ChartConfig } from "@/lib/charts/chart-config"
import type { Analysis } from "@/lib/types/analysis"
import { chartTypeIcon } from "@/lib/types/charts"

/**
 * Payload cru de `GET/POST/PUT /api/analyses` (camelCase do backend).
 *
 * Divergências conhecidas em relação ao tipo `Analysis` do frontend
 * (a API espelha o banco, onde os campos são nullable):
 *   - description/sql      : string|null  -> string  ("" quando null)
 *   - databaseId           : number|null  -> number  (0 quando null; falsy, como antes)
 *   - chartType            : string|null  -> ChartType (fallback "table" se desconhecido)
 *   - createdBy            : existe só na API, fora do tipo do frontend
 *   - projectId            : string|null (UUID do projeto; null = sem projeto)
 *   - chartConfig          : object|null  -> ChartConfig|null ({} = sem config)
 */
export interface ApiAnalysis {
  id: string
  name: string
  description: string | null
  sql: string | null
  databaseId: number | null
  dbSchema: string | null
  datasetId: number | null
  chartType: string | null
  dimension: string | null
  metric: string | null
  chartConfig?: Record<string, unknown> | null
  projectId: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface AnalysisInput {
  name: string
  description?: string | null
  sql?: string | null
  databaseId?: number | null
  dbSchema?: string | null
  datasetId?: number | null
  chartType?: string | null
  dimension?: string | null
  metric?: string | null
  /** Apresentação completa do gráfico; `null`/ausente limpa a config. */
  chartConfig?: ChartConfig | null
  /** ausente: PUT não altera o vínculo; null: remove; string: associa */
  projectId?: string | null
}

function contractError(what: string): ApiError {
  return new ApiError(502, `Resposta inesperada da API (${what})`)
}

function assertApiAnalysis(raw: unknown): ApiAnalysis {
  const value = raw as ApiAnalysis | null
  if (
    !value ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    throw contractError("/api/analyses: campos obrigatórios ausentes")
  }
  return value
}

export function assertChartType(value: string | null): Analysis["chartType"] {
  if (value && value in chartTypeIcon) {
    return value as Analysis["chartType"]
  }
  return "table"
}

/**
 * Lê a config persistida sem quebrar a página se o payload vier inválido:
 * config corrompida vira `null` e a análise segue utilizável no modo legado.
 */
function parseChartConfig(raw: unknown): ChartConfig | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  if (Object.keys(raw).length === 0) return null
  try {
    return normalizeChartConfig(raw)
  } catch {
    return null
  }
}

export function toAnalysis(raw: unknown): Analysis {
  const value = assertApiAnalysis(raw)

  return {
    id: value.id,
    name: value.name,
    description: value.description ?? "",
    sql: value.sql ?? "",
    databaseId: value.databaseId ?? 0,
    dbSchema: value.dbSchema ?? null,
    datasetId: value.datasetId ?? null,
    chartType: assertChartType(value.chartType),
    dimension: value.dimension ?? null,
    metric: value.metric ?? null,
    chartConfig: parseChartConfig(value.chartConfig),
    projectId: typeof value.projectId === "string" ? value.projectId : null,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  }
}

function toAnalysisPayload(data: AnalysisInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: data.name,
    description: data.description ?? null,
    sql: data.sql ?? null,
    databaseId: data.databaseId || null,
    dbSchema: data.dbSchema ?? null,
    datasetId: data.datasetId ?? null,
    chartType: data.chartType ?? null,
    dimension: data.dimension ?? null,
    metric: data.metric ?? null,
    // undefined -> PUT não altera; null/objeto -> limpa/grava a config.
    ...(data.chartConfig !== undefined ? { chartConfig: data.chartConfig } : {}),
  }
  // ausente -> PUT não altera o vínculo; null -> remove; string -> associa.
  if (data.projectId !== undefined) {
    payload.projectId = data.projectId
  }
  return payload
}

export async function getAnalyses(projectId?: string): Promise<Analysis[]> {
  const path = projectId
    ? `/api/analyses?projectId=${encodeURIComponent(projectId)}`
    : "/api/analyses"
  const raw = await apiGet<unknown>(path)
  if (!Array.isArray(raw)) {
    throw contractError("/api/analyses: esperava uma lista")
  }
  return raw.map(toAnalysis)
}

export async function getAnalysis(id: string): Promise<Analysis | null> {
  try {
    return toAnalysis(await apiGet<unknown>(`/api/analyses/${id}`))
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  }
}

export async function createAnalysis(data: AnalysisInput): Promise<Analysis> {
  const raw = await apiPost<unknown>("/api/analyses", toAnalysisPayload(data))
  return toAnalysis(raw)
}

export async function updateAnalysis(
  id: string,
  data: AnalysisInput
): Promise<Analysis> {
  const raw = await apiPut<unknown>(`/api/analyses/${id}`, toAnalysisPayload(data))
  return toAnalysis(raw)
}

export async function deleteAnalysis(id: string): Promise<void> {
  await apiDelete(`/api/analyses/${id}`)
}
