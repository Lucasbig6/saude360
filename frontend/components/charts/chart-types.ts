import { BarChart3, ChartSpline, Filter, Gauge, Grid3x3, Layers, LineChart, PieChart, Radar, ScatterChart } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { CHART_TYPES } from "@/lib/charts/chart-config"
import type { ChartType } from "@/lib/charts/chart-config"

export interface ChartTypeMeta {
  label: string
  icon: LucideIcon
  requiresCategory: boolean
  supportsAggregation: boolean
  supportsColor: boolean
  supportsSize: boolean
}

export const CHART_TYPE_META: Record<ChartType, ChartTypeMeta> = {
  bar: {
    label: "Barras",
    icon: BarChart3,
    requiresCategory: true,
    supportsAggregation: true,
    supportsColor: true,
    supportsSize: false,
  },
  line: {
    label: "Linha",
    icon: LineChart,
    requiresCategory: true,
    supportsAggregation: true,
    supportsColor: true,
    supportsSize: false,
  },
  area: {
    label: "Área",
    icon: ChartSpline,
    requiresCategory: true,
    supportsAggregation: true,
    supportsColor: true,
    supportsSize: false,
  },
  pie: {
    label: "Pizza",
    icon: PieChart,
    requiresCategory: true,
    supportsAggregation: true,
    supportsColor: false,
    supportsSize: false,
  },
  donut: {
    label: "Rosca",
    icon: PieChart,
    requiresCategory: true,
    supportsAggregation: true,
    supportsColor: false,
    supportsSize: false,
  },
  scatter: {
    label: "Dispersão",
    icon: ScatterChart,
    requiresCategory: false,
    supportsAggregation: true,
    supportsColor: true,
    supportsSize: true,
  },
  radar: {
    label: "Radar",
    icon: Radar,
    requiresCategory: true,
    supportsAggregation: true,
    supportsColor: true,
    supportsSize: false,
  },
  gauge: {
    label: "Medidor",
    icon: Gauge,
    requiresCategory: false,
    supportsAggregation: true,
    supportsColor: false,
    supportsSize: false,
  },
  funnel: {
    label: "Funil",
    icon: Filter,
    requiresCategory: true,
    supportsAggregation: true,
    supportsColor: false,
    supportsSize: false,
  },
  heatmap: {
    label: "Mapa de calor",
    icon: Grid3x3,
    requiresCategory: true,
    supportsAggregation: true,
    supportsColor: true,
    supportsSize: false,
  },
  treemap: {
    label: "Treemap",
    icon: Layers,
    requiresCategory: true,
    supportsAggregation: true,
    supportsColor: true,
    supportsSize: false,
  },
}

export function chartTypeLabel(type: ChartType): string {
  return CHART_TYPE_META[type]?.label ?? type
}

export function isChartTypeSupported(type: string): type is ChartType {
  return CHART_TYPES.includes(type as ChartType)
}
