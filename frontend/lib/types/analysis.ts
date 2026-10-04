import type { ChartConfig } from "@/lib/charts/chart-config"
import type { AnalysisChartType } from "@/lib/types/charts"

export interface Analysis {
  id: string
  name: string
  description: string
  sql: string
  databaseId: number
  dbSchema: string | null
  datasetId: number | null
  chartType: AnalysisChartType
  dimension: string | null
  metric: string | null
  /** Apresentação completa do gráfico (título, rótulos, cores...). */
  chartConfig: ChartConfig | null
  projectId: string | null
  createdAt: string
  updatedAt: string
}
