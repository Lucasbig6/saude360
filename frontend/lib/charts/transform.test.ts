import { describe, expect, it } from "vitest"
import { prepareData } from "@/lib/charts/transform"
import type { ChartConfig } from "@/lib/charts/chart-config"

const anos = [
  { municipio: "Teresina", ano: "2025", total: 100 },
  { municipio: "Teresina", ano: "2026", total: 150 },
  { municipio: "Parnaíba", ano: "2025", total: 80 },
  { municipio: "Parnaíba", ano: "2026", total: 120 },
]

const unicos = [
  { municipio: "Teresina", total: 100 },
  { municipio: "Parnaíba", total: 80 },
]

function seriesTypes(config: ChartConfig, rows: Record<string, unknown>[]) {
  return prepareData(rows, config)
}

describe("prepareData sem agregação", () => {
  it("preserva as linhas e monta categorias e série única", () => {
    const config: ChartConfig = { type: "bar", encoding: { x: "municipio", y: "total" } }
    const prepared = seriesTypes(config, unicos)

    expect(prepared.rows).toEqual(unicos)
    expect(prepared.categories).toEqual(["Teresina", "Parnaíba"])
    expect(prepared.series).toEqual([{ name: "total", data: [100, 80] }])
  })

  it("converte valores não numéricos em null", () => {
    const config: ChartConfig = { type: "bar", encoding: { x: "municipio", y: "total" } }
    const prepared = seriesTypes(config, [
      { municipio: "A", total: "10" },
      { municipio: "B", total: "abc" },
    ])

    expect(prepared.series[0].data).toEqual([10, null])
  })

  it("estrutura vazia para lista vazia", () => {
    const config: ChartConfig = { type: "bar", encoding: { x: "municipio", y: "total" } }
    const prepared = seriesTypes(config, [])

    expect(prepared.categories).toEqual([])
    expect(prepared.series).toEqual([{ name: "total", data: [] }])
    expect(prepared.points).toEqual([])
    expect(prepared.cells).toEqual([])
    expect(prepared.nodes).toEqual([])
    expect(prepared.value).toBeNull()
  })
})

describe("prepareData com agregação", () => {
  it("soma por categoria", () => {
    const config: ChartConfig = {
      type: "bar",
      encoding: { x: "municipio", y: "total" },
      aggregation: { field: "total", function: "sum" },
    }
    const prepared = seriesTypes(config, anos)

    expect(prepared.categories).toEqual(["Teresina", "Parnaíba"])
    expect(prepared.series[0].data).toEqual([250, 200])
    expect(prepared.rows).toEqual([
      { municipio: "Teresina", total: 250 },
      { municipio: "Parnaíba", total: 200 },
    ])
  })

  it("divide séries pelo campo color", () => {
    const config: ChartConfig = {
      type: "bar",
      encoding: { x: "municipio", y: "total", color: "ano" },
      aggregation: { field: "total", function: "sum" },
    }
    const prepared = seriesTypes(config, anos)

    expect(prepared.series.map((item) => item.name)).toEqual(["2025", "2026"])
    expect(prepared.series[0].data).toEqual([100, 80])
    expect(prepared.series[1].data).toEqual([150, 120])
  })

  it("calcula avg, min, max e count", () => {
    const rows = [
      { municipio: "A", total: 10 },
      { municipio: "A", total: 20 },
      { municipio: "A", total: 30 },
    ]
    const base = {
      encoding: { x: "municipio", y: "total" },
      type: "bar" as const,
    }

    expect(
      seriesTypes({ ...base, aggregation: { field: "total", function: "avg" } }, rows)
        .series[0].data,
    ).toEqual([20])
    expect(
      seriesTypes({ ...base, aggregation: { field: "total", function: "min" } }, rows)
        .series[0].data,
    ).toEqual([10])
    expect(
      seriesTypes({ ...base, aggregation: { field: "total", function: "max" } }, rows)
        .series[0].data,
    ).toEqual([30])
    expect(
      seriesTypes({ ...base, aggregation: { field: "total", function: "count" } }, rows)
        .series[0].data,
    ).toEqual([3])
  })

  it("agrega sem dimensão em uma única linha", () => {
    const config: ChartConfig = {
      type: "gauge",
      aggregation: { field: "total", function: "sum" },
    }
    const prepared = seriesTypes(config, [
      { total: 10 },
      { total: 20 },
    ])

    expect(prepared.rows).toEqual([{ total: 30 }])
    expect(prepared.value).toBe(30)
  })
})

describe("prepareData com sort e limit", () => {
  const rows = [
    { municipio: "A", total: 10 },
    { municipio: "B", total: 30 },
    { municipio: "C", total: 20 },
  ]

  it("ordena decrescente pela medida e limita", () => {
    const config: ChartConfig = {
      type: "bar",
      encoding: { x: "municipio", y: "total" },
      sort: { field: "total", direction: "desc" },
      limit: 2,
    }
    const prepared = seriesTypes(config, rows)

    expect(prepared.categories).toEqual(["B", "C"])
    expect(prepared.series[0].data).toEqual([30, 20])
  })

  it("ordena crescente pela categoria", () => {
    const config: ChartConfig = {
      type: "bar",
      encoding: { x: "municipio", y: "total" },
      sort: { field: "municipio", direction: "asc" },
    }
    const prepared = seriesTypes(config, rows)

    expect(prepared.categories).toEqual(["A", "B", "C"])
  })

  it("limita sem ordenação preservando a ordem original", () => {
    const config: ChartConfig = {
      type: "bar",
      encoding: { x: "municipio", y: "total" },
      limit: 2,
    }
    const prepared = seriesTypes(config, rows)

    expect(prepared.categories).toEqual(["A", "B"])
  })
})

describe("prepareData para formatos especiais", () => {
  it("monta pontos para scatter com tamanho", () => {
    const config: ChartConfig = {
      type: "scatter",
      encoding: { x: "populacao", y: "taxa", size: "casos" },
    }
    const prepared = prepareData(
      [
        { populacao: 1000, taxa: 5.5, casos: 10, nome: "A" },
        { populacao: 2000, taxa: 2.5, casos: 40, nome: "B" },
      ],
      config,
    )

    expect(prepared.points).toEqual([
      { x: 1000, y: 5.5, name: "1000", size: 10 },
      { x: 2000, y: 2.5, name: "2000", size: 40 },
    ])
  })

  it("monta células para heatmap", () => {
    const config: ChartConfig = {
      type: "heatmap",
      encoding: { x: "municipio", y: "total", color: "ano" },
      aggregation: { field: "total", function: "sum" },
    }
    const prepared = seriesTypes(config, anos)

    expect(prepared.cells).toEqual([
      { x: 0, y: 0, value: 100 },
      { x: 0, y: 1, value: 150 },
      { x: 1, y: 0, value: 80 },
      { x: 1, y: 1, value: 120 },
    ])
  })

  it("monta nós planos para treemap sem agrupamento", () => {
    const config: ChartConfig = {
      type: "treemap",
      encoding: { x: "municipio", y: "total" },
      aggregation: { field: "total", function: "sum" },
    }
    const prepared = seriesTypes(config, anos)

    expect(prepared.nodes).toEqual([
      { name: "Teresina", value: 250 },
      { name: "Parnaíba", value: 200 },
    ])
  })

  it("agrupa nós por color no treemap", () => {
    const config: ChartConfig = {
      type: "treemap",
      encoding: { x: "municipio", y: "total", color: "ano" },
      aggregation: { field: "total", function: "sum" },
    }
    const prepared = seriesTypes(config, anos)

    expect(prepared.nodes).toEqual([
      {
        name: "2025",
        children: [
          { name: "Teresina", value: 100 },
          { name: "Parnaíba", value: 80 },
        ],
        value: 180,
      },
      {
        name: "2026",
        children: [
          { name: "Teresina", value: 150 },
          { name: "Parnaíba", value: 120 },
        ],
        value: 270,
      },
    ])
  })

  it("soma as medidas quando há várias linhas (gauge)", () => {
    const config: ChartConfig = { type: "gauge", encoding: { y: "total" } }
    const prepared = seriesTypes(config, [
      { total: 10 },
      { total: 20 },
    ])

    expect(prepared.value).toBe(30)
  })
})
