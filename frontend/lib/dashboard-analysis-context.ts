import type { Analysis } from "@/lib/types/analysis"
import type { Dashboard } from "@/lib/types/dashboard"
import type { AnalysisChartType } from "@/lib/types/charts"
import { getAnalyses } from "@/lib/api/analyses"

/**
 * Contexto estrutural do dashboard para o futuro Copiloto/Agente.
 *
 * IMPORTANTE (ETAPA 6): apenas contrato de dados. NÃO implementa LangChain,
 * LangGraph, LLM, ferramentas de agente, streaming, memória ou RAG.
 *
 * Fluxo futuro (não implementado):
 *   Dashboard
 *     → Copiloto
 *       → Agente
 *         → Ferramentas controladas
 *              - get_dashboard_context()
 *              - get_dataset_schema()
 *              - execute_query()
 *              - analyze_result()
 *              - create_chart()
 *              - explain_result()
 *
 * Contrato de envio futuro (sem acoplamento a frameworks):
 *   onSendMessage(message: string, context: DashboardAnalysisContext)
 */
export interface DashboardAnalysisContextWidget {
  analysisId: string
  title: string
  chartType: AnalysisChartType
  datasetId: number | null
  databaseId: number
  dbSchema: string | null
  dimension: string | null
  metric: string | null
  sql: string
}

export interface DashboardAnalysisContext {
  dashboard: {
    id: string
    name: string
    description: string
  }
  widgets: DashboardAnalysisContextWidget[]
}

/**
 * Monta o contexto do dashboard resolvendo cada analysisId na lista já
 * carregada. Não duplica dados de análise no dashboard.
 */
export function buildDashboardAnalysisContext(
  dashboard: Dashboard,
  analyses: Analysis[]
): DashboardAnalysisContext {
  const byId = new Map(analyses.map((analysis) => [analysis.id, analysis]))
  const widgets: DashboardAnalysisContextWidget[] = []

  for (const widget of dashboard.widgets) {
    const analysis = byId.get(widget.analysisId)
    if (!analysis) continue

    widgets.push({
      analysisId: analysis.id,
      title: analysis.name,
      chartType: analysis.chartType,
      datasetId: analysis.datasetId,
      databaseId: analysis.databaseId,
      dbSchema: analysis.dbSchema,
      dimension: analysis.dimension,
      metric: analysis.metric,
      sql: analysis.sql,
    })
  }

  return {
    dashboard: {
      id: dashboard.id,
      name: dashboard.name,
      description: dashboard.description,
    },
    widgets,
  }
}

/** Contexto vazio: dashboard presente, nenhuma análise resolvida. */
export function emptyDashboardAnalysisContext(
  dashboard: Dashboard
): DashboardAnalysisContext {
  return buildDashboardAnalysisContext(dashboard, [])
}

/**
 * Lê as análises da API (1 request, sem N+1) e monta o contexto.
 */
export async function getDashboardAnalysisContext(
  dashboard: Dashboard
): Promise<DashboardAnalysisContext> {
  const analyses = await getAnalyses()
  return buildDashboardAnalysisContext(dashboard, analyses)
}
