import { apiGet, apiPost, apiPut, apiDelete } from "../api"

export type SourceType = "postgresql" | "csv" | "excel" | "parquet"

export interface SourceTypeConfig {
  id: SourceType
  label: string
  icon: string
  description: string
  needsConnection: boolean
}

export const SOURCE_TYPES: SourceTypeConfig[] = [
  {
    id: "postgresql",
    label: "PostgreSQL",
    icon: "Database",
    description: "Conexão com banco de dados PostgreSQL.",
    needsConnection: true,
  },
  {
    id: "csv",
    label: "CSV",
    icon: "FileText",
    description: "Arquivo de valores separados por vírgula.",
    needsConnection: false,
  },
  {
    id: "excel",
    label: "Excel",
    icon: "Table",
    description: "Planilha Microsoft Excel (.xlsx).",
    needsConnection: false,
  },
  {
    id: "parquet",
    label: "Parquet",
    icon: "FileStack",
    description: "Arquivo Apache Parquet colunar.",
    needsConnection: false,
  },
]

export function getSourceTypeConfig(engine: string): SourceTypeConfig {
  const normalized = engine?.toLowerCase() ?? ""
  return (
    SOURCE_TYPES.find((t) => t.id === normalized) ?? SOURCE_TYPES[0]
  )
}

export interface SourceListItem {
  id: number
  database_name: string
  engine: string
}

export interface SourcesListResponse {
  count: number
  result: SourceListItem[]
}

export interface SourceDetail {
  id: number
  database_name: string
  engine: string
}

export interface CreateSourceRequest {
  database_name: string
  engine?: string
  host: string
  port: number
  database: string
  username: string
  password: string
  /** Projeto que passa a ser dono da fonte (opcional). */
  projectId?: string
}

export interface SourceProject {
  id: string
  name: string
  description: string | null
}

export interface UpdateSourceRequest {
  database_name?: string
  host?: string
  port?: number
  database?: string
  username?: string
  password?: string
}

export interface TestConnectionRequest {
  host: string
  port: number
  database: string
  username: string
  password: string
}

export interface TestConnectionResponse {
  success: boolean
  message: string
  detail?: string
}

export async function listSources(
  projectId?: string
): Promise<SourcesListResponse> {
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""
  return apiGet<SourcesListResponse>(`/api/sources${query}`)
}

export async function getSourceProjects(
  sourceId: number
): Promise<SourceProject[]> {
  return apiGet<SourceProject[]>(`/api/sources/${sourceId}/projects`)
}

export async function linkSourceToProject(
  sourceId: number,
  projectId: string
): Promise<void> {
  await apiPost(`/api/sources/${sourceId}/projects`, { projectId })
}

export async function unlinkSourceFromProject(
  sourceId: number,
  projectId: string
): Promise<void> {
  await apiDelete(`/api/sources/${sourceId}/projects/${projectId}`)
}

export async function getSource(id: number): Promise<SourceDetail> {
  return apiGet<SourceDetail>(`/api/sources/${id}`)
}

export async function createSource(data: CreateSourceRequest): Promise<unknown> {
  return apiPost<unknown>("/api/sources", data)
}

export async function updateSource(
  id: number,
  data: UpdateSourceRequest
): Promise<unknown> {
  return apiPut<unknown>(`/api/sources/${id}`, data)
}

export async function deleteSource(id: number): Promise<void> {
  return apiDelete(`/api/sources/${id}`)
}

export async function testConnection(
  data: TestConnectionRequest
): Promise<TestConnectionResponse> {
  return apiPost<TestConnectionResponse>("/api/sources/test", data)
}

export async function getSourceDatasets(sourceId: number): Promise<unknown> {
  return apiGet<unknown>(`/api/sources/${sourceId}/datasets`)
}

export interface SchemasResponse {
  schemas: string[]
}

export interface TableItem {
  name: string
  type: string
}

export interface TablesResponse {
  schema: string
  tables: TableItem[]
}

export interface TableColumn {
  name: string
  type: string
  long_type: string
  keys: string[]
}

export interface TableMetadataResponse {
  table: string
  schema: string
  columns: TableColumn[]
  select_star: string
}

export async function getSourceSchemas(sourceId: number): Promise<SchemasResponse> {
  return apiGet<SchemasResponse>(`/api/sources/${sourceId}/schemas`)
}

export async function getSourceTables(
  sourceId: number,
  schema: string
): Promise<TablesResponse> {
  return apiGet<TablesResponse>(
    `/api/sources/${sourceId}/tables?schema=${encodeURIComponent(schema)}`
  )
}

export async function getTableMetadata(
  sourceId: number,
  schema: string,
  table: string
): Promise<TableMetadataResponse> {
  return apiGet<TableMetadataResponse>(
    `/api/sources/${sourceId}/table-metadata?schema=${encodeURIComponent(schema)}&table=${encodeURIComponent(table)}`
  )
}
