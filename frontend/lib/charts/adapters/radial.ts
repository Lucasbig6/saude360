import type { EChartsOption } from "echarts"
import type { PreparedData } from "../transform"

export function radar(data: PreparedData): EChartsOption {
  const values = data.series.flatMap((item) =>
    item.data.filter((value): value is number => value !== null),
  )
  const max = values.length > 0 ? Math.max(...values) : 1

  return {
    radar: {
      indicator: data.categories.map((name) => ({ name, max: max > 0 ? max * 1.2 : 1 })),
    },
    series: data.series.map((item) => ({
      name: item.name,
      type: "radar" as const,
      data: [{ value: item.data.map((value) => value ?? 0), name: item.name }],
    })),
  }
}

export function gauge(data: PreparedData): EChartsOption {
  return {
    series: [
      {
        type: "gauge",
        detail: { formatter: "{value}" },
        data: [{ value: data.value ?? 0, name: "" }],
      },
    ],
  }
}
