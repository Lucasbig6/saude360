import { describe, expect, it } from "vitest"
import {
  buildAnalysisPayload,
  presentationFromAnalysis,
} from "./analysis-payload"
import { DEFAULT_DISPLAY_OPTIONS } from "@/lib/charts/display-options"
import type { PresentationState, WorkspaceData } from "./workspace"

const workspace: WorkspaceData = {
  rows: [{ mes: "2026-01", total: 10 }],
  rowCount: 1,
  truncated: false,
  executionMs: 8,
  sql: "SELECT mes, total FROM demo",
  source: "agent",
  databaseId: 1,
  dbSchema: "public",
  datasetId: 12,
  datasetName: "demo",
}

function presentation(
  overrides: Partial<PresentationState> = {}
): PresentationState {
  return {
    chartType: "line",
    dimension: "mes",
    metric: "total",
    colorField: "uf",
    display: {
      ...DEFAULT_DISPLAY_OPTIONS,
      title: "Atendimentos por mês",
      sortField: "total",
      sortDirection: "asc",
      limit: 50,
    },
    viewMode: "chart",
    filters: [{ field: "uf", operator: "=", value: "PE" }],
    ...overrides,
  }
}

describe("buildAnalysisPayload → presentationFromAnalysis (round-trip)", () => {
  it("preserva tipo, dimensão, métrica, cor, ordem, limite e filtros", () => {
    const payload = buildAnalysisPayload({
      name: "Atendimentos",
      description: "por mês",
      projectId: "p1",
      workspace,
      presentation: presentation(),
    })

    expect(payload).toMatchObject({
      name: "Atendimentos",
      description: "por mês",
      projectId: "p1",
      sql: "SELECT mes, total FROM demo",
      databaseId: 1,
      dbSchema: "public",
      datasetId: 12,
      chartType: "line",
      dimension: "mes",
      metric: "total",
    })
    expect(payload.chartConfig).toMatchObject({
      type: "line",
      encoding: { x: "mes", y: "total", color: "uf" },
      title: "Atendimentos por mês",
      sort: { field: "total", direction: "asc" },
      limit: 50,
      filters: [{ field: "uf", operator: "=", value: "PE" }],
    })

    const restored = presentationFromAnalysis(payload)
    expect(restored).toEqual(presentation())
  })

  it("preserva rótulos de valor (showValues) no round-trip", () => {
    const payload = buildAnalysisPayload({
      name: "Rotulada",
      description: "",
      projectId: "p1",
      workspace,
      presentation: presentation({
        display: { ...presentation().display, showValues: true },
      }),
    })

    expect(payload.chartConfig?.showValues).toBe(true)

    const restored = presentationFromAnalysis(payload)
    expect(restored.display.showValues).toBe(true)
  })

  it("modo tabela salva sem encoding e restaura como tabela", () => {
    const payload = buildAnalysisPayload({
      name: "Bruto",
      description: "",
      projectId: "p1",
      workspace,
      presentation: presentation({ viewMode: "table" }),
    })

    expect(payload.chartType).toBe("table")
    expect(payload.dimension).toBeNull()
    expect(payload.metric).toBeNull()
    expect(payload.chartConfig).toBeNull()

    const restored = presentationFromAnalysis(payload)
    expect(restored.viewMode).toBe("table")
    expect(restored.chartType).toBe("bar")
    expect(restored.filters).toEqual([])
  })

  it("kpi mantém a identidade do indicador", () => {
    const payload = buildAnalysisPayload({
      name: "Total",
      description: "",
      projectId: "p1",
      workspace,
      presentation: presentation({
        chartType: "kpi",
        dimension: null,
        metric: "total",
        colorField: null,
      }),
    })

    expect(payload.chartType).toBe("kpi")
    expect(payload.chartConfig?.type).toBe("bar")
    expect(payload.chartConfig?.encoding?.y).toBe("total")

    const restored = presentationFromAnalysis(payload)
    expect(restored.chartType).toBe("kpi")
    expect(restored.metric).toBe("total")
    expect(restored.viewMode).toBe("chart")
  })
})
