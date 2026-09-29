import type { EChartsOption } from "echarts"
import type { ChartConfig } from "../chart-config"
import type { PreparedData } from "../transform"

export type ChartAdapter = (config: ChartConfig, data: PreparedData) => EChartsOption

export function groupTotals(data: PreparedData): number[] {
  return data.categories.map((_, index) => {
    let total = 0
    for (const item of data.series) {
      total += item.data[index] ?? 0
    }
    return total
  })
}

export function cartesian(
  data: PreparedData,
  kind: "bar" | "line" | "area",
): EChartsOption {
  return {
    grid: { left: 8, right: 16, top: 32, bottom: 8, containLabel: true },
    xAxis: { type: "category", data: data.categories },
    yAxis: { type: "value" },
    series: data.series.map((item) => ({
      name: item.name,
      type: kind === "bar" ? "bar" : "line",
      data: item.data,
      ...(kind === "area" ? { areaStyle: { opacity: 0.25 } } : {}),
    })),
  }
}

export function scatter(data: PreparedData): EChartsOption {
  const sizes = data.points
    .map((point) => point.size)
    .filter((size): size is number => size !== null && size > 0)
  const min = sizes.length > 0 ? Math.min(...sizes) : 0
  const max = sizes.length > 0 ? Math.max(...sizes) : 0

  return {
    grid: { left: 8, right: 16, top: 32, bottom: 8, containLabel: true },
    xAxis: { type: "value" },
    yAxis: { type: "value" },
    series: [
      {
        type: "scatter",
        data: data.points
          .filter((point): point is { x: number; y: number; name: string; size: number | null } => {
            return point.y !== null
          })
          .map((point) => ({
            name: point.name,
            value: [point.x, point.y],
            symbolSize:
              point.size === null
                ? 12
                : max > min
                  ? 8 + ((point.size - min) / (max - min)) * 32
                  : 12,
          })),
      },
    ],
  }
}
