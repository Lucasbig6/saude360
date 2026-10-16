import { apiGet, apiPost } from "../api"

export interface DatasetColumn {
  column_name: string
  type: string
  is_dttm: boolean
  filterable: boolean
  groupby: boolean
}

export interface DatasetDatabase {
  id: number
  database_name: string
}

export interface DatasetListItem {
  id: number
  table_name: string
  schema: string
  description?: string | null
  extra?: string | Record<string, unknown> | null
  database: DatasetDatabase
  columns: DatasetColumn[]
}

export interface DatasetsListResponse {
  count: number
  result: DatasetListItem[]
}

export interface DatasetDetail extends DatasetListItem {
  description: string | null
}

export interface DistinctValuesResponse {
  result: string[]
}

export async function listDatasets(): Promise<DatasetsListResponse> {
  return apiGet<DatasetsListResponse>("/api/datasets")
}

export async function getDataset(id: number): Promise<DatasetDetail> {
  return apiGet<DatasetDetail>(`/api/datasets/${id}`)
}

export async function getDistinctValues(
  datasetId: number,
  columnName: string
): Promise<DistinctValuesResponse> {
  return apiGet<DistinctValuesResponse>(
    `/api/datasets/${datasetId}/distinct/${encodeURIComponent(columnName)}`
  )
}

export interface CreateDatasetRequest {
  database_id: number
  table_name: string
  table_schema?: string
  description?: string
}

export async function createDataset(data: CreateDatasetRequest): Promise<unknown> {
  return apiPost<unknown>("/api/datasets", data)
}

export interface PublishDatasetRequest {
  database_id: number
  sql: string
  db_schema: string | null
  name: string
  description: string | null
}

export interface PublishDatasetResponse {
  id: number
  table_name: string
  schema: string | null
  name: string
  description: string | null
  database_id: number
}

export async function publishDataset(
  data: PublishDatasetRequest
): Promise<PublishDatasetResponse> {
  return apiPost<PublishDatasetResponse>("/api/datasets/publish", data)
}

export function datasetDisplayName(dataset: {
  table_name: string
  description?: string | null
  extra?: string | Record<string, unknown> | null
}): string {
  let extra: unknown = dataset.extra
  if (typeof extra === "string") {
    try {
      extra = JSON.parse(extra)
    } catch {
      extra = null
    }
  }
  if (extra && typeof extra === "object" && "monisus_display_name" in extra) {
    const displayName = (extra as Record<string, unknown>).monisus_display_name
    if (typeof displayName === "string" && displayName.trim()) {
      return displayName.trim()
    }
  }

  const description = dataset.description?.trim()
  if (description) return description

  return dataset.table_name
    .replace(/^monisus_ds_/, "")
    .replace(/_[0-9a-f]{6}$/, "")
    .replace(/_/g, " ")
}
