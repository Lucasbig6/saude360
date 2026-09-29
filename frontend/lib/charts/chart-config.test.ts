import { describe, expect, it } from "vitest"
import {
  CHART_TYPES,
  defaultChartConfig,
  isAggregationFunction,
  isChartType,
  isWidgetType,
  legacyToChartConfig,
  normalizeChartConfig,
} from "@/lib/charts/chart-config"

describe("guardas de tipo", () => {
  it("reconhece tipos de gráfico válidos e inválidos", () => {
    for (const type of CHART_TYPES) {
      expect(isChartType(type)).toBe(true)
    }
    expect(isChartType("table")).toBe(false)
    expect(isChartType("unknown")).toBe(false)
    expect(isChartType(42)).toBe(false)
  })

  it("reconhece tipos de widget incluindo os não gráficos", () => {
    expect(isWidgetType("table")).toBe(true)
    expect(isWidgetType("kpi")).toBe(true)
    expect(isWidgetType("text")).toBe(true)
    expect(isWidgetType("image")).toBe(true)
    expect(isWidgetType("gauge")).toBe(true)
    expect(isWidgetType("iframe")).toBe(false)
  })

  it("valida funções de agregação", () => {
    expect(isAggregationFunction("sum")).toBe(true)
    expect(isAggregationFunction("median")).toBe(false)
  })
})

describe("defaultChartConfig", () => {
  it("cria config com legenda e tooltip habilitados", () => {
    expect(defaultChartConfig("bar")).toEqual({
      type: "bar",
      legend: true,
      tooltip: true,
    })
  })
})

describe("normalizeChartConfig", () => {
  it("normaliza uma config completa", () => {
    const config = normalizeChartConfig({
      type: "bar",
      encoding: { x: "municipio", y: "total", color: "ano" },
      aggregation: { field: "total", function: "sum" },
      sort: { field: "total", direction: "desc" },
      limit: 10,
      legend: false,
      tooltip: true,
      title: "Atendimentos",
      options: { barMaxWidth: 40 },
    })

    expect(config).toEqual({
      type: "bar",
      encoding: { x: "municipio", y: "total", color: "ano" },
      aggregation: { field: "total", function: "sum" },
      sort: { field: "total", direction: "desc" },
      limit: 10,
      legend: false,
      tooltip: true,
      title: "Atendimentos",
      options: { barMaxWidth: 40 },
    })
  })

  it("descarta campos de encoding vazios", () => {
    const config = normalizeChartConfig({
      type: "line",
      encoding: { x: "", y: "valor" },
    })

    expect(config.encoding).toEqual({ y: "valor" })
    expect(config.legend).toBe(true)
    expect(config.tooltip).toBe(true)
  })

  it("lança erro para tipo desconhecido", () => {
    expect(() => normalizeChartConfig({ type: "sunburst" })).toThrow(
      "tipo de gráfico desconhecido",
    )
  })

  it("lança erro para entrada não objeto", () => {
    expect(() => normalizeChartConfig(null)).toThrow("ChartConfig inválida")
    expect(() => normalizeChartConfig("bar")).toThrow("ChartConfig inválida")
  })

  it("lança erro para agregação inválida", () => {
    expect(() =>
      normalizeChartConfig({ type: "bar", aggregation: { field: "", function: "sum" } }),
    ).toThrow("aggregation.field inválido")
    expect(() =>
      normalizeChartConfig({ type: "bar", aggregation: { field: "x", function: "median" } }),
    ).toThrow("aggregation.function inválido")
  })

  it("lança erro para sort e limit inválidos", () => {
    expect(() =>
      normalizeChartConfig({ type: "bar", sort: { field: "x", direction: "up" } }),
    ).toThrow("sort.direction inválido")
    expect(() => normalizeChartConfig({ type: "bar", limit: 0 })).toThrow("limit inválido")
    expect(() => normalizeChartConfig({ type: "bar", limit: -3 })).toThrow("limit inválido")
  })
})

describe("legacyToChartConfig", () => {
  it("mapeia a análise legada para ChartConfig", () => {
    const config = legacyToChartConfig({
      chartType: "line",
      dimension: "mes",
      metric: "total",
    })

    expect(config).toEqual({
      type: "line",
      legend: true,
      tooltip: true,
      encoding: { x: "mes", y: "total" },
    })
  })

  it("retorna null para análises de tabela", () => {
    expect(
      legacyToChartConfig({ chartType: "table", dimension: null, metric: null }),
    ).toBeNull()
  })

  it("usa bar como fallback para tipo desconhecido", () => {
    const config = legacyToChartConfig({ chartType: "boxplot", dimension: null, metric: null })
    expect(config?.type).toBe("bar")
  })

  it("omite encoding quando não há dimensão/métrica", () => {
    const config = legacyToChartConfig({ chartType: "pie", dimension: null, metric: null })
    expect(config).toEqual({ type: "pie", legend: true, tooltip: true })
  })
})
