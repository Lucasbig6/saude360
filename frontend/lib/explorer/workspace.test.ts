import { describe, expect, it } from "vitest"
import {
  groupHistoryByDay,
  presentationFromRows,
} from "./workspace"

describe("presentationFromRows", () => {
  it("sugere tabela sem linhas", () => {
    expect(presentationFromRows([])).toMatchObject({ viewMode: "table" })
  })

  it("sugere KPI para linha única", () => {
    expect(presentationFromRows([{ total: 10 }])).toMatchObject({
      chartType: "kpi",
      viewMode: "chart",
    })
  })

  it("sugere barra com dimensão e métrica", () => {
    expect(
      presentationFromRows([
        { municipio: "A", total: 1 },
        { municipio: "B", total: 2 },
      ])
    ).toMatchObject({
      chartType: "bar",
      dimension: "municipio",
      metric: "total",
      viewMode: "chart",
    })
  })
})

describe("groupHistoryByDay", () => {
  function entry(at: number, id: string) {
    return {
      id,
      question: `q-${id}`,
      datasetId: 1,
      datasetName: "ds",
      at,
      status: "done" as const,
      hasResult: true,
    }
  }

  it("agrupa Hoje/Ontem e ordena recentes primeiro", () => {
    const now = Date.now()
    const groups = groupHistoryByDay([
      entry(now - 3 * 86_400_000, "old"),
      entry(now - 86_400_000, "yesterday"),
      entry(now, "today-b"),
      entry(now - 1000, "today-a"),
    ])
    expect(groups.map((g) => g.label)[0]).toBe("Hoje")
    expect(groups[0].entries.map((e) => e.id)).toEqual(["today-b", "today-a"])
    expect(groups.map((g) => g.label)).toContain("Ontem")
  })

  it("retorna vazio sem entradas", () => {
    expect(groupHistoryByDay([])).toEqual([])
  })
})
