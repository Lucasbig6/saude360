import type { EChartsOption } from "echarts"
import { chartAdapters } from "./adapters"
import type { ChartConfig, ChartType } from "./chart-config"
import type { PreparedData } from "./transform"

const TOOLTIP_TRIGGER: Partial<Record<ChartType, "axis" | "item">> = {
  bar: "axis",
  line: "axis",
  area: "axis",
  scatter: "item",
  pie: "item",
  donut: "item",
  radar: "item",
  gauge: "item",
  funnel: "item",
  heatmap: "item",
  treemap: "item",
}

const LEGEND_TYPES: ChartType[] = [
  "bar",
  "line",
  "area",
  "scatter",
  "pie",
  "donut",
  "radar",
  "funnel",
  "heatmap",
]

function showLegend(config: ChartConfig, data: PreparedData): boolean {
  if (!LEGEND_TYPES.includes(config.type)) {
    return false
  }
  if (config.type === "pie" || config.type === "donut" || config.type === "funnel") {
    return data.categories.length > 0
  }
  return data.series.length > 1
}

export function toEChartsOption(config: ChartConfig, data: PreparedData): EChartsOption {
  const adapter = chartAdapters[config.type] ?? chartAdapters.bar
  const option: EChartsOption = { ...adapter(config, data) }

  if (config.title) {
    option.title = { text: config.title, left: "center" }
  }

  if (config.tooltip === false) {
    option.tooltip = { show: false }
  } else {
    option.tooltip = { trigger: TOOLTIP_TRIGGER[config.type] ?? "item" }
  }

  if (config.legend === false || !showLegend(config, data)) {
    option.legend = { show: false }
  } else {
    option.legend = { bottom: 0 }
  }

  if (config.options) {
    Object.assign(option, config.options)
  }

  return option
}
