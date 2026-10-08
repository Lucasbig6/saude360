import { analyzeColumns } from "./columns"
import type { VisualizationType } from "@/lib/types/charts"

export interface VizSuggestion {
  chartType: VisualizationType
  dimension: string | null
  metric: string | null
}

const TEMPORAL_HINT =
  /(data|date|dia|mes|mês|ano|semana|trimestre|periodo|período|competencia|competência|safra)/i

/**
 * Heurística de visualização inicial para um resultado tabular:
 * 1 linha + métrica numérica → KPI; dimensão temporal → linha;
 * dimensão categórica + métrica numérica → barra; sem par válido → tabela.
 */
export function suggestViz(rows: Record<string, unknown>[]): VizSuggestion {
  const fallback: VizSuggestion = {
    chartType: "bar",
    dimension: null,
    metric: null,
  }
  if (rows.length === 0) return fallback

  const columns = analyzeColumns(rows)
  const categorical = columns
    .filter((c) => c.type === "categorical")
    .map((c) => c.name)
  const numeric = columns
    .filter((c) => c.type === "numeric")
    .map((c) => c.name)

  if (rows.length === 1 && numeric.length >= 1) {
    return { chartType: "kpi", dimension: null, metric: numeric[0] }
  }

  const dimension = categorical[0] ?? null
  const metric = numeric[0] ?? null
  if (!dimension || !metric) return { ...fallback, dimension, metric }

  return {
    chartType: TEMPORAL_HINT.test(dimension) ? "line" : "bar",
    dimension,
    metric,
  }
}
