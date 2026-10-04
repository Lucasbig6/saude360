import { describe, expect, it } from "vitest"
import { toEChartsOption } from "@/lib/charts/echarts-adapter"
import { defaultChartConfig, type ChartConfig } from "@/lib/charts/chart-config"
import { prepareData, type Row } from "@/lib/charts/transform"

const rows = [
  { municipio: "Teresina", ano: "2025", total: 100 },
  { municipio: "Teresina", ano: "2026", total: 150 },
  { municipio: "Parnaíba", ano: "2025", total: 80 },
  { municipio: "Parnaíba", ano: "2026", total: 120 },
]

function optionFor(config: ChartConfig, data: Row[] = rows) {
  return toEChartsOption(config, prepareData(data, config))
}

function seriesList(option: ReturnType<typeof optionFor>): Array<{ type?: string }> {
  const series = option.series
  if (!series) {
    return []
  }
  return Array.isArray(series) ? (series as Array<{ type?: string }>) : [series as { type?: string }]
}

describe("toEChartsOption por tipo de gráfico", () => {
  it("bar", () => {
    const option = optionFor({
      ...defaultChartConfig("bar"),
      encoding: { x: "municipio", y: "total" },
    })

    expect(seriesList(option)[0].type).toBe("bar")
    const xAxis = option.xAxis as { data?: string[] }
    expect(xAxis.data).toEqual(["Teresina", "Parnaíba"])
  })

  it("bar-horizontal", () => {
    const option = optionFor({
      ...defaultChartConfig("bar-horizontal"),
      encoding: { x: "municipio", y: "total" },
    })

    expect(seriesList(option)[0].type).toBe("bar")
    expect(option.xAxis).toMatchObject({ type: "value" })
    expect(option.yAxis).toMatchObject({
      type: "category",
      data: ["Teresina", "Parnaíba"],
    })
  })

  it("line e area", () => {
    const line = optionFor({
      ...defaultChartConfig("line"),
      encoding: { x: "municipio", y: "total" },
    })
    expect(seriesList(line)[0].type).toBe("line")

    const area = optionFor({
      ...defaultChartConfig("area"),
      encoding: { x: "municipio", y: "total" },
    })
    const areaSeries = seriesList(area)[0] as { type?: string; areaStyle?: unknown }
    expect(areaSeries.type).toBe("line")
    expect(areaSeries.areaStyle).toBeDefined()
  })

  it("pie e donut", () => {
    const pie = optionFor({
      ...defaultChartConfig("pie"),
      encoding: { x: "municipio", y: "total" },
      aggregation: { field: "total", function: "sum" },
    })
    const pieSeries = seriesList(pie)[0] as { type?: string; radius?: unknown; data?: unknown[] }
    expect(pieSeries.type).toBe("pie")
    expect(pieSeries.radius).toBe("70%")
    expect(pieSeries.data).toHaveLength(2)

    const donut = optionFor({
      ...defaultChartConfig("donut"),
      encoding: { x: "municipio", y: "total" },
      aggregation: { field: "total", function: "sum" },
    })
    expect((seriesList(donut)[0] as { radius?: unknown }).radius).toEqual(["45%", "70%"])
  })

  it("scatter", () => {
    const option = optionFor({
      ...defaultChartConfig("scatter"),
      encoding: { x: "populacao", y: "taxa" },
    }, [
      { populacao: 1000, taxa: 5 },
      { populacao: 2000, taxa: 2 },
    ])

    expect(seriesList(option)[0].type).toBe("scatter")
  })

  it("radar", () => {
    const option = optionFor({
      ...defaultChartConfig("radar"),
      encoding: { x: "municipio", y: "total" },
      aggregation: { field: "total", function: "sum" },
    })

    expect(seriesList(option)[0].type).toBe("radar")
    const radar = option.radar as { indicator?: unknown[] }
    expect(radar.indicator).toHaveLength(2)
  })

  it("gauge", () => {
    const option = optionFor({
      ...defaultChartConfig("gauge"),
      encoding: { y: "total" },
      aggregation: { field: "total", function: "sum" },
    })

    const gauge = seriesList(option)[0] as { type?: string; data?: Array<{ value: number }> }
    expect(gauge.type).toBe("gauge")
    expect(gauge.data?.[0].value).toBe(450)
  })

  it("funnel", () => {
    const option = optionFor({
      ...defaultChartConfig("funnel"),
      encoding: { x: "municipio", y: "total" },
      aggregation: { field: "total", function: "sum" },
    })

    expect(seriesList(option)[0].type).toBe("funnel")
  })

  it("heatmap", () => {
    const option = optionFor({
      ...defaultChartConfig("heatmap"),
      encoding: { x: "municipio", y: "total", color: "ano" },
      aggregation: { field: "total", function: "sum" },
    })

    expect(seriesList(option)[0].type).toBe("heatmap")
    expect(option.visualMap).toBeDefined()
    const yAxis = option.yAxis as { data?: string[] }
    expect(yAxis.data).toEqual(["2025", "2026"])
  })

  it("treemap", () => {
    const option = optionFor({
      ...defaultChartConfig("treemap"),
      encoding: { x: "municipio", y: "total" },
      aggregation: { field: "total", function: "sum" },
    })

    const tree = seriesList(option)[0] as { type?: string; data?: unknown[] }
    expect(tree.type).toBe("treemap")
    expect(tree.data).toHaveLength(2)
  })
})

describe("toEChartsOption opções globais", () => {
  it("aplica título quando presente", () => {
    const option = optionFor({
      ...defaultChartConfig("bar"),
      encoding: { x: "municipio", y: "total" },
      title: "Atendimentos por município",
    })

    const title = option.title as { text?: string }
    expect(title.text).toBe("Atendimentos por município")
  })

  it("desliga tooltip quando tooltip=false", () => {
    const option = optionFor({
      ...defaultChartConfig("bar"),
      encoding: { x: "municipio", y: "total" },
      tooltip: false,
    })

    expect((option.tooltip as { show?: boolean }).show).toBe(false)
  })

  it("usa tooltip por eixo no gráfico de barras", () => {
    const option = optionFor({
      ...defaultChartConfig("bar"),
      encoding: { x: "municipio", y: "total" },
    })

    expect((option.tooltip as { trigger?: string }).trigger).toBe("axis")
  })

  it("esconde legenda quando legend=false", () => {
    const option = optionFor({
      ...defaultChartConfig("bar"),
      encoding: { x: "municipio", y: "total", color: "ano" },
      legend: false,
    })

    expect((option.legend as { show?: boolean }).show).toBe(false)
  })

  it("mostra legenda com séries múltiplas", () => {
    const option = optionFor({
      ...defaultChartConfig("bar"),
      encoding: { x: "municipio", y: "total", color: "ano" },
      aggregation: { field: "total", function: "sum" },
    })

    const legend = option.legend as { show?: boolean; bottom?: string | number }
    expect(legend.show).not.toBe(false)
    expect(legend.bottom).toBe(0)
  })

  it("esconde legenda em série única", () => {
    const option = optionFor({
      ...defaultChartConfig("bar"),
      encoding: { x: "municipio", y: "total" },
    })

    expect((option.legend as { show?: boolean }).show).toBe(false)
  })

  it("mescla options como escape hatch", () => {
    const option = optionFor({
      ...defaultChartConfig("bar"),
      encoding: { x: "municipio", y: "total" },
      options: { animation: false },
    })

    expect(option.animation).toBe(false)
  })
})

describe("toEChartsOption apresentação", () => {
  it("aplica rótulos de eixo e formata os ticks do eixo de valor", () => {
    const option = optionFor({
      ...defaultChartConfig("bar"),
      encoding: { x: "municipio", y: "total" },
      xAxisLabel: "Município",
      yAxisLabel: "Atendimentos",
      numberFormat: "currency",
    })

    expect(option.xAxis).toMatchObject({ name: "Município" })
    const yAxis = option.yAxis as { name?: string; axisLabel?: { formatter?: unknown } }
    expect(yAxis.name).toBe("Atendimentos")
    expect(yAxis.axisLabel?.formatter).toBeTypeOf("function")
    expect((yAxis.axisLabel?.formatter as (v: unknown) => string)(1500)).toBe(
      "R$\u00A01.500,00"
    )
  })

  it("mantém os rótulos nos eixos visuais em barras horizontais", () => {
    const option = optionFor({
      ...defaultChartConfig("bar-horizontal"),
      encoding: { x: "municipio", y: "total" },
      xAxisLabel: "Eixo X",
      yAxisLabel: "Eixo Y",
    })

    // X continua sendo o eixo horizontal (de valores) em qualquer orientação.
    expect(option.xAxis).toMatchObject({ name: "Eixo X" })
    expect(option.yAxis).toMatchObject({ name: "Eixo Y" })
    const yAxis = option.yAxis as { axisLabel?: { formatter?: unknown } }
    expect(yAxis.axisLabel?.formatter).toBeUndefined()
  })

  it("mostra data labels quando showValues=true", () => {
    const option = optionFor({
      ...defaultChartConfig("bar"),
      encoding: { x: "municipio", y: "total" },
      showValues: true,
    })

    const series = seriesList(option)[0] as {
      label?: { show?: boolean; formatter?: string }
    }
    expect(series.label?.show).toBe(true)
    expect(series.label?.formatter).toBe("{c}")
  })

  it("formata data labels de pizza com nome e valor", () => {
    const option = optionFor({
      ...defaultChartConfig("pie"),
      encoding: { x: "municipio", y: "total" },
      aggregation: { field: "total", function: "sum" },
      showValues: true,
    })

    const series = seriesList(option)[0] as { label?: { formatter?: string } }
    expect(series.label?.formatter).toBe("{b}: {c}")
  })

  it("empilha apenas quando há mais de uma série", () => {
    const multi = optionFor({
      ...defaultChartConfig("bar"),
      encoding: { x: "municipio", y: "total", color: "ano" },
      aggregation: { field: "total", function: "sum" },
      stacked: true,
    })
    for (const series of seriesList(multi) as Array<Record<string, unknown>>) {
      expect(series.stack).toBe("total")
    }

    const single = optionFor({
      ...defaultChartConfig("bar"),
      encoding: { x: "municipio", y: "total" },
      stacked: true,
    })
    expect((seriesList(single)[0] as Record<string, unknown>).stack).toBeUndefined()
  })

  it("suaviza linhas quando smooth=true", () => {
    const option = optionFor({
      ...defaultChartConfig("line"),
      encoding: { x: "municipio", y: "total" },
      smooth: true,
    })

    expect((seriesList(option)[0] as Record<string, unknown>).smooth).toBe(true)
  })

  it("aplica paleta customizada", () => {
    const option = optionFor({
      ...defaultChartConfig("bar"),
      encoding: { x: "municipio", y: "total" },
      colors: ["#0f766e", "#14b8a6"],
    })

    expect(option.color).toEqual(["#0f766e", "#14b8a6"])
  })

  it("posiciona a legenda conforme legendPosition", () => {
    const base: ChartConfig = {
      ...defaultChartConfig("bar"),
      encoding: { x: "municipio", y: "total", color: "ano" },
      aggregation: { field: "total", function: "sum" },
    }

    expect(optionFor({ ...base, legendPosition: "right" })).toMatchObject({
      legend: { right: 0, orient: "vertical" },
    })
    expect(optionFor({ ...base, legendPosition: "top" })).toMatchObject({
      legend: { top: 0, left: "center" },
    })
    expect(optionFor({ ...base, legendPosition: "left" })).toMatchObject({
      legend: { left: 0, orient: "vertical" },
    })
  })

  it("habilita exportação PNG quando exportable=true", () => {
    const option = optionFor({
      ...defaultChartConfig("bar"),
      encoding: { x: "municipio", y: "total" },
      title: "Meu gráfico",
      exportable: true,
    })

    const toolbox = option.toolbox as {
      feature?: { saveAsImage?: { name?: string; pixelRatio?: number } }
    }
    expect(toolbox.feature?.saveAsImage?.name).toBe("Meu gráfico")
    expect(toolbox.feature?.saveAsImage?.pixelRatio).toBe(2)
    expect(option.grid).toMatchObject({ top: 56 })
  })

  it("não cria toolbox quando exportable não está definido", () => {
    const option = optionFor({
      ...defaultChartConfig("bar"),
      encoding: { x: "municipio", y: "total" },
    })

    expect(option.toolbox).toBeUndefined()
  })

  it("formata o valor do gauge", () => {
    const option = optionFor({
      ...defaultChartConfig("gauge"),
      encoding: { y: "total" },
      aggregation: { field: "total", function: "sum" },
      numberFormat: "percent",
    })

    const gauge = seriesList(option)[0] as {
      detail?: { formatter?: unknown }
    }
    expect(gauge.detail?.formatter).toBeTypeOf("function")
    expect((gauge.detail?.formatter as (v: unknown) => string)(0.42)).toBe("42%")
  })
})
