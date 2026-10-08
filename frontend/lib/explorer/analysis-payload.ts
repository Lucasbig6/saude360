import { buildConfig } from "@/components/explorer/preview-chart"
import { chartConfigToDisplay } from "@/lib/charts/display-options"
import type { AnalysisInput } from "@/lib/api/analyses"
import type { PresentationState, WorkspaceData } from "./workspace"

export interface SavePayloadInput {
  name: string
  description: string
  projectId: string | null
  workspace: WorkspaceData
  presentation: PresentationState
}

/**
 * Monta o payload de criação/atualização de análise a partir do workspace
 * compartilhado + apresentação atual. Mesma regra do QueryResult: modo
 * tabela salva sem encoding; modo gráfico salva chartType/dimensão/métrica
 * + chartConfig completa.
 */
export function buildAnalysisPayload({
  name,
  description,
  projectId,
  workspace,
  presentation,
}: SavePayloadInput): AnalysisInput {
  const isChart = presentation.viewMode !== "table"
  return {
    name,
    description,
    sql: workspace.sql ?? "",
    databaseId: workspace.databaseId ?? null,
    dbSchema: workspace.dbSchema ?? null,
    datasetId: workspace.datasetId ?? null,
    chartType: isChart ? presentation.chartType : "table",
    dimension: isChart ? presentation.dimension : null,
    metric: isChart ? presentation.metric : null,
    chartConfig: isChart
      ? buildConfig(
          presentation.chartType,
          presentation.dimension,
          presentation.metric,
          presentation.colorField,
          presentation.display
        )
      : null,
    projectId,
  }
}

/** Restaura a apresentação salva de uma análise (usado em ?analysisId=). */
export function presentationFromAnalysis(analysis: {
  chartType: string
  dimension: string | null
  metric: string | null
  chartConfig: Parameters<typeof chartConfigToDisplay>[0]
}): PresentationState {
  const display = chartConfigToDisplay(analysis.chartConfig)
  const isTable = analysis.chartType === "table"
  return {
    chartType: (isTable ? "bar" : analysis.chartType) as PresentationState["chartType"],
    dimension: analysis.dimension,
    metric: analysis.metric,
    colorField: analysis.chartConfig?.encoding?.color ?? null,
    display,
    viewMode: isTable ? "table" : "chart",
  }
}
