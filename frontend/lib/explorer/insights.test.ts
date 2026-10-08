import { describe, expect, it } from "vitest"
import { computeInsightStats } from "./insights"

const ROWS = [
  { mes: "jan", total: 100 },
  { mes: "fev", total: 120 },
  { mes: "mar", total: 158 },
]

describe("computeInsightStats", () => {
  it("retorna vazio sem linhas", () => {
    expect(computeInsightStats([], "mes", "total")).toEqual([])
  })

  it("calcula variação, pico e último valor", () => {
    const stats = computeInsightStats(ROWS, "mes", "total")
    expect(stats).toHaveLength(3)
    expect(stats[0].value).toContain("58")
    expect(stats[0].label).toBe("variação no período")
    expect(stats[1].value).toBe("MAR")
    expect(stats[1].label).toContain("158")
    expect(stats[2].value).toBe("158")
  })

  it("resume volume sem par dimensão/métrica", () => {
    const stats = computeInsightStats(ROWS, null, null)
    expect(stats).toEqual([
      { value: "3", label: "linhas retornadas" },
      { value: "2", label: "colunas" },
    ])
  })

  it("mostra total quando há um único ponto", () => {
    const stats = computeInsightStats([{ total: 42 }], null, "total")
    expect(stats[0]).toEqual({ value: "42", label: "total total" })
  })
})
