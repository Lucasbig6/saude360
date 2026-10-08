import { describe, expect, it } from "vitest"
import { suggestViz } from "./agent-viz"

describe("suggestViz", () => {
  it("retorna vazio sem linhas", () => {
    expect(suggestViz([])).toEqual({
      chartType: "bar",
      dimension: null,
      metric: null,
    })
  })

  it("sugere KPI para uma única linha com métrica numérica", () => {
    expect(suggestViz([{ total: 120 }])).toEqual({
      chartType: "kpi",
      dimension: null,
      metric: "total",
    })
  })

  it("sugere barra para dimensão categórica + métrica numérica", () => {
    expect(
      suggestViz([
        { municipio: "Recife", total: 80 },
        { municipio: "Olinda", total: 40 },
      ])
    ).toEqual({ chartType: "bar", dimension: "municipio", metric: "total" })
  })

  it("sugere linha para dimensão temporal", () => {
    expect(
      suggestViz([
        { mes: "2024-01", total: 10 },
        { mes: "2024-02", total: 20 },
      ])
    ).toEqual({ chartType: "line", dimension: "mes", metric: "total" })
  })

  it("devolve nulos sem par dimensão/métrica válido", () => {
    expect(
      suggestViz([{ a: "x" }, { a: "y" }])
    ).toEqual({ chartType: "bar", dimension: "a", metric: null })
  })
})
