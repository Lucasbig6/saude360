import type { EChartsOption } from "echarts"
import { chartAdapters } from "./adapters"
import type { ChartConfig, ChartNumberFormat, ChartType } from "./chart-config"
import { echartsValueFormatter } from "./format"
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

const SERIES_LABEL_TYPES: ChartType[] = [
  "bar",
  "bar-horizontal",
  "line",
  "area",
  "scatter",
  "pie",
  "donut",
  "funnel",
]

type AxisLike = { name?: string; nameGap?: number; axisLabel?: Record<string, unknown> }

function showLegend(config: ChartConfig, data: PreparedData): boolean {
  if (!LEGEND_TYPES.includes(config.type)) {
    return false
  }
  if (config.type === "pie" || config.type === "donut" || config.type === "funnel") {
    return data.categories.length > 0
  }
  return data.series.length > 1
}

function legendLocation(position: ChartConfig["legendPosition"]): Record<string, unknown> {
  switch (position) {
    case "top":
      return { top: 0, left: "center" }
    case "left":
      return { left: 0, orient: "vertical" }
    case "right":
      return { right: 0, orient: "vertical" }
    case "bottom":
    default:
      return { bottom: 0 }
  }
}

/**
 * Aplica os campos de apresentação (rótulos de eixo, formatação, data labels,
 * empilhamento, suavidade e paleta) por cima da option montada pelo adapter.
 */
function applyPresentation(option: EChartsOption, config: ChartConfig): EChartsOption {
  const format: ChartNumberFormat = config.numberFormat ?? "number"
  const valueFormatter = echartsValueFormatter(format)
  const isCartesian = ["bar", "bar-horizontal", "line", "area", "scatter"].includes(
    config.type
  )

  // Rótulos dos eixos + formatação dos ticks no eixo de valor.
  if (isCartesian) {
    const horizontal = config.type === "bar-horizontal"
    const scatter = config.type === "scatter"
    // Os rótulos seguem os eixos visuais (X = horizontal, Y = vertical),
    // independentemente da orientação das barras. Em scatter os dois são
    // de valor e ambos recebem a formatação.
    const axes: Array<[keyof EChartsOption, string | undefined, boolean]> = [
      ["xAxis", config.xAxisLabel, horizontal || scatter],
      ["yAxis", config.yAxisLabel, !horizontal || scatter],
    ]
    for (const [key, name, isValueAxis] of axes) {
      const axis = option[key] as AxisLike | AxisLike[] | undefined
      if (!axis || Array.isArray(axis)) continue
      if (name) axis.name = name
      if (isValueAxis) {
        axis.axisLabel = { ...(axis.axisLabel ?? {}), formatter: valueFormatter }
      }
    }
  }

  if (config.showValues && SERIES_LABEL_TYPES.includes(config.type)) {
    const seriesList = Array.isArray(option.series) ? option.series : []
    for (const series of seriesList) {
      const item = series as Record<string, unknown>
      const isPieLike = item.type === "pie" || item.type === "funnel"
      item.label = {
        show: true,
        ...(isPieLike
          ? { formatter: "{b}: {c}" }
          : { position: horizontalLabelPosition(config.type), formatter: "{c}" }),
      }
      item.labelLine = { show: isPieLike }
    }
  }

  if (config.stacked && Array.isArray(option.series)) {
    const stackable = option.series.filter((series) => {
      const item = series as Record<string, unknown>
      return item.type === "bar" || item.type === "line"
    })
    // Só empilha quando há mais de uma série — série única empilhada é a
    // própria barra e o stack só mexe no empilhamento visual.
    if (stackable.length > 1) {
      for (const series of stackable) {
        ;(series as Record<string, unknown>).stack = "total"
      }
      if (config.type === "area") {
        for (const series of stackable) {
          ;(series as Record<string, unknown>).areaStyle = { opacity: 0.6 }
        }
      }
    }
  }

  if (config.smooth && Array.isArray(option.series)) {
    for (const series of option.series) {
      const item = series as Record<string, unknown>
      if (item.type === "line") item.smooth = true
    }
  }

  if (config.colors && config.colors.length > 0) {
    option.color = config.colors
  }

  if (config.tooltip !== false) {
    option.tooltip = {
      ...(option.tooltip as Record<string, unknown>),
      valueFormatter,
    }
  }

  if (config.exportable) {
    option.toolbox = {
      right: 8,
      top: 8,
      feature: {
        saveAsImage: { name: config.title ?? "grafico", pixelRatio: 2 },
      },
    }
    option.grid = {
      ...((option.grid as Record<string, unknown> | undefined) ?? {}),
      top: 56,
    }
  }

  // KPI/gauge: aplica a formatação no detail.
  if (config.type === "gauge" && Array.isArray(option.series)) {
    const gauge = option.series[0] as Record<string, unknown> | undefined
    if (gauge && typeof gauge.detail === "object" && gauge.detail) {
      ;(gauge.detail as Record<string, unknown>).formatter = valueFormatter
    }
  }

  return option
}

function horizontalLabelPosition(type: ChartType): string {
  if (type === "bar-horizontal") return "right"
  return "top"
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
    option.legend = { ...legendLocation(config.legendPosition) }
  }

  applyPresentation(option, config)

  if (config.options) {
    Object.assign(option, config.options)
  }

  return option
}
