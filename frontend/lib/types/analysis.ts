import type { ChartType } from "@/lib/types/charts"

export interface Analysis {
  id: string
  name: string
  description: string
  sql: string
  databaseId: number
  dbSchema: string | null
  datasetId: number | null
  chartType: ChartType
  dimension: string | null
  metric: string | null
  projectId: string | null
  createdAt: string
  updatedAt: string
}
