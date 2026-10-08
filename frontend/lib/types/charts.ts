import { Table2 } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { CHART_TYPE_META } from "@/components/charts/chart-types"
import type { ChartType as ChartWidgetType } from "@/lib/charts/chart-config"

export type ChartType = ChartWidgetType | "table"
export type AnalysisChartType = ChartType | "kpi"

/** Tipos plotáveis no explorador (tabela tratada à parte). */
export type VisualizationType = Exclude<ChartType, "table"> | "kpi"

export const chartTypeLabel: Record<AnalysisChartType, string> = {
  table: "Tabela",
  kpi: "KPI",
  bar: CHART_TYPE_META.bar.label,
  "bar-horizontal": CHART_TYPE_META["bar-horizontal"].label,
  line: CHART_TYPE_META.line.label,
  area: CHART_TYPE_META.area.label,
  pie: CHART_TYPE_META.pie.label,
  donut: CHART_TYPE_META.donut.label,
  scatter: CHART_TYPE_META.scatter.label,
  radar: CHART_TYPE_META.radar.label,
  gauge: CHART_TYPE_META.gauge.label,
  funnel: CHART_TYPE_META.funnel.label,
  heatmap: CHART_TYPE_META.heatmap.label,
  treemap: CHART_TYPE_META.treemap.label,
  map: CHART_TYPE_META.map.label,
}

export const chartTypeIcon: Record<AnalysisChartType, LucideIcon> = {
  table: Table2,
  kpi: CHART_TYPE_META.gauge.icon,
  bar: CHART_TYPE_META.bar.icon,
  "bar-horizontal": CHART_TYPE_META["bar-horizontal"].icon,
  line: CHART_TYPE_META.line.icon,
  area: CHART_TYPE_META.area.icon,
  pie: CHART_TYPE_META.pie.icon,
  donut: CHART_TYPE_META.donut.icon,
  scatter: CHART_TYPE_META.scatter.icon,
  radar: CHART_TYPE_META.radar.icon,
  gauge: CHART_TYPE_META.gauge.icon,
  funnel: CHART_TYPE_META.funnel.icon,
  heatmap: CHART_TYPE_META.heatmap.icon,
  treemap: CHART_TYPE_META.treemap.icon,
  map: CHART_TYPE_META.map.icon,
}
