import type { EChartsOption } from "echarts"
import type { PreparedData } from "../transform"

export function heatmap(data: PreparedData): EChartsOption {
  const values = data.cells.map((cell) => cell.value)
  return {
    grid: { left: 8, right: 16, top: 32, bottom: 8, containLabel: true },
    xAxis: { type: "category", data: data.categories },
    yAxis: { type: "category", data: data.series.map((item) => item.name) },
    visualMap: {
      min: values.length > 0 ? Math.min(...values) : 0,
      max: values.length > 0 ? Math.max(...values) : 1,
      calculable: true,
      orient: "horizontal",
      left: "center",
      bottom: 0,
    },
    series: [
      {
        type: "heatmap",
        data: data.cells.map((cell) => [cell.x, cell.y, cell.value]),
      },
    ],
  }
}

export function treemap(data: PreparedData): EChartsOption {
  return {
    series: [{ type: "treemap", roam: false, data: data.nodes }],
  }
}
