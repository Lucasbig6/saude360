import type { ChartType } from "../chart-config"
import { cartesian, scatter } from "./cartesian"
import { funnel, pie } from "./circular"
import { gauge, radar } from "./radial"
import { heatmap, treemap } from "./matrix"
import type { ChartAdapter } from "./cartesian"

export type { ChartAdapter } from "./cartesian"

export const chartAdapters: Record<ChartType, ChartAdapter> = {
  bar: (_config, data) => cartesian(data, "bar"),
  line: (_config, data) => cartesian(data, "line"),
  area: (_config, data) => cartesian(data, "area"),
  scatter: (_config, data) => scatter(data),
  pie: (_config, data) => pie(data, false),
  donut: (_config, data) => pie(data, true),
  radar: (_config, data) => radar(data),
  gauge: (_config, data) => gauge(data),
  funnel: (_config, data) => funnel(data),
  heatmap: (_config, data) => heatmap(data),
  treemap: (_config, data) => treemap(data),
}
