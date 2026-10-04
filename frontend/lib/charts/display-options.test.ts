import { describe, expect, it } from "vitest"
import {
  DEFAULT_DISPLAY_OPTIONS,
  PALETTES,
  chartConfigToDisplay,
  paletteColors,
} from "@/lib/charts/display-options"
import { defaultChartConfig, normalizeChartConfig } from "@/lib/charts/chart-config"

describe("paletteColors", () => {
  it("resolve paletas conhecidas e devolve undefined para desconhecidas", () => {
    expect(paletteColors("teal")).toHaveLength(6)
    expect(paletteColors("auto")).toBeUndefined()
    expect(paletteColors("inexistente")).toBeUndefined()
  })

  it("cada preset tem id e label únicos", () => {
    const ids = PALETTES.map((preset) => preset.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(PALETTES[0].id).toBe("auto")
  })
})

describe("chartConfigToDisplay", () => {
  it("devolve os padrões quando não há config", () => {
    expect(chartConfigToDisplay(null)).toEqual(DEFAULT_DISPLAY_OPTIONS)
    expect(chartConfigToDisplay(undefined)).toEqual(DEFAULT_DISPLAY_OPTIONS)
  })

  it("espelha os campos de apresentação salvos", () => {
    const config = normalizeChartConfig({
      type: "bar",
      encoding: { x: "municipio", y: "total" },
      title: "Atendimentos",
      xAxisLabel: "Município",
      yAxisLabel: "Total",
      numberFormat: "currency",
      showValues: true,
      legend: false,
      legendPosition: "right",
      colors: ["#0f766e", "#14b8a6"],
      stacked: true,
      smooth: true,
      sort: { field: "total", direction: "asc" },
      limit: 10,
      exportable: false,
    })

    expect(chartConfigToDisplay(config)).toEqual({
      ...DEFAULT_DISPLAY_OPTIONS,
      title: "Atendimentos",
      xAxisLabel: "Município",
      yAxisLabel: "Total",
      numberFormat: "currency",
      showValues: true,
      legend: false,
      legendPosition: "right",
      colors: ["#0f766e", "#14b8a6"],
      stacked: true,
      smooth: true,
      sortField: "total",
      sortDirection: "asc",
      limit: 10,
      exportable: false,
    })
  })

  it("config sem campos de apresentação usa os padrões (exportable ausente = off)", () => {
    const display = chartConfigToDisplay(defaultChartConfig("line"))
    expect(display).toEqual({ ...DEFAULT_DISPLAY_OPTIONS, exportable: false })
  })
})
