import { apiPost } from "../api"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

export interface ExecuteQueryRequest {
  database_id: number
  sql: string
  db_schema?: string
}

export interface FilterClause {
  column: string
  operator: "eq" | "in" | "gte" | "lte" | "between"
  values: string | string[]
}

export interface ExecuteFilteredQueryRequest extends ExecuteQueryRequest {
  filters: FilterClause[]
}

export interface QueryResult {
  status: string
  data: Record<string, unknown>[]
  message?: string
}

export async function executeQuery(params: ExecuteQueryRequest): Promise<QueryResult> {
  return apiPost<QueryResult>("/api/queries/execute", params)
}

export async function executeQueryFiltered(
  params: ExecuteFilteredQueryRequest
): Promise<QueryResult> {
  return apiPost<QueryResult>("/api/queries/execute-filtered", params)
}

export interface PublicExecuteQueryRequest extends ExecuteQueryRequest {
  analysis_id: string
  filters?: FilterClause[]
}

/**
 * Executa uma query no contexto de um painel público (sem autenticação).
 * O backend valida que o `analysis_id` pertence a um dashboard antes de executar.
 */
export async function executePublicQuery(
  params: PublicExecuteQueryRequest
): Promise<QueryResult> {
  const response = await fetch(`${API_BASE_URL}/api/queries/execute-public`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  const data = (await response.json().catch(() => ({}))) as QueryResult
  return data
}
