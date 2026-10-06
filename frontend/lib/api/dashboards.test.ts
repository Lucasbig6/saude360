import { describe, expect, it } from "vitest"
import { toDashboard, toDashboardPayload } from "@/lib/api/dashboards"
import type { Dashboard } from "@/lib/types/dashboard"

interface RawWidget {
  id: string
  analysisId: string
  layout: { x: number; y: number; w: number; h: number }
  widget?: unknown
}

function rawDashboard(): Record<string, unknown> {
  const widgets: RawWidget[] = [
    {
      id: "w1",
      analysisId: "a1",
      layout: { x: 0, y: 0, w: 6, h: 4 },
      widget: {
        type: "bar",
        encoding: { x: "municipio", y: "total" },
        legend: false,
      },
    },
    {
      id: "w2",
      analysisId: "a2",
      layout: { x: 6, y: 0, w: 6, h: 4 },
      widget: { type: "sunburst" },
    },
    {
      id: "w3",
      analysisId: "a3",
      layout: { x: 0, y: 4, w: 4, h: 4 },
    },
  ]

  return {
    id: "d1",
    name: "Painel",
    description: null,
    slug: "painel",
    appearance: {},
    widgets,
    filters: [],
    projectId: null,
    createdBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }
}

function dashboardFixture(overrides: Partial<Dashboard> = {}): Dashboard {
  return {
    id: "d1",
    name: "Painel",
    description: "",
    slug: "painel",
    widgets: [],
    filters: [],
    appearance: {},
    projectId: null,
    createdBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

describe("toDashboard (widget v2)", () => {
  it("mapeia widget válido para config normalizada", () => {
    const dashboard = toDashboard(rawDashboard())

    expect(dashboard.widgets[0].config).toEqual({
      type: "bar",
      legend: false,
      tooltip: true,
      encoding: { x: "municipio", y: "total" },
    })
  })

  it("widget inválido vira config ausente (fallback legado no render)", () => {
    const dashboard = toDashboard(rawDashboard())

    expect(dashboard.widgets[1].config).toBeUndefined()
  })

  it("widget sem a chave widget também vira config ausente", () => {
    const dashboard = toDashboard(rawDashboard())

    expect(dashboard.widgets[2].config).toBeUndefined()
  })

  it("widget estático round-trip", () => {
    const raw = rawDashboard()
    ;(raw.widgets as RawWidget[])[2] = {
      id: "w3",
      analysisId: "a3",
      layout: { x: 0, y: 4, w: 4, h: 4 },
      widget: { type: "kpi", field: "total", function: "sum" },
    }

    expect(toDashboard(raw).widgets[2].config).toEqual({
      type: "kpi",
      field: "total",
      function: "sum",
    })
  })
})

describe("toDashboardPayload (widget v2)", () => {
  it("envia config como widget e omite quando ausente", () => {
    const payload = toDashboardPayload(toDashboard(rawDashboard()))

    expect(payload.widgets?.[0].widget).toEqual({
      type: "bar",
      legend: false,
      tooltip: true,
      encoding: { x: "municipio", y: "total" },
    })
    expect(payload.widgets?.[1].widget).toBeUndefined()
    expect(payload.widgets?.[2].widget).toBeUndefined()
    expect(Object.keys(payload.widgets?.[1] ?? {})).not.toContain("widget")
  })

  it("mantém o layout e converte a sentinela y=Infinity na primeira linha livre", () => {
    const payload = toDashboardPayload(
      dashboardFixture({
        widgets: [
          {
            id: "w9",
            analysisId: "a9",
            layout: { x: 0, y: 2, w: 6, h: 4 },
          },
          {
            id: "w8",
            analysisId: "a8",
            layout: { x: 6, y: Infinity, w: 6, h: 3 },
          },
        ],
      })
    )

    expect(payload.widgets?.[0].layout).toEqual({ x: 0, y: 2, w: 6, h: 4 })
    expect(payload.widgets?.[1].layout).toEqual({ x: 6, y: 6, w: 6, h: 3 })
  })
})
