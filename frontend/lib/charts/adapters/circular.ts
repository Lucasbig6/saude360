import type { EChartsOption } from "echarts"
import type { PreparedData } from "../transform"
import { groupTotals } from "./cartesian"

export function pie(data: PreparedData, donut: boolean): EChartsOption {
  const totals = groupTotals(data)
  return {
    series: [
      {
        type: "pie",
        radius: donut ? ["45%", "70%"] : "70%",
        data: data.categories.map((name, index) => ({
          name,
          value: totals[index] ?? 0,
        })),
      },
    ],
  }
}

export function funnel(data: PreparedData): EChartsOption {
  const totals = groupTotals(data)
  return {
    series: [
      {
        type: "funnel",
        data: data.categories.map((name, index) => ({
          name,
          value: totals[index] ?? 0,
        })),
      },
    ],
  }
}
