import { describe, expect, it, vi, beforeEach } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { DashboardBuilder } from "./dashboard-builder"
import type { Dashboard } from "@/lib/types/dashboard"
import * as dashboardsApi from "@/lib/api/dashboards"
import * as analysesApi from "@/lib/api/analyses"
import * as projectsApi from "@/lib/api/projects"
import * as datasetsApi from "@/lib/api/datasets"

vi.mock("@/lib/api/dashboards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/dashboards")>()
  return { ...actual, updateDashboard: vi.fn() }
})
vi.mock("@/lib/api/analyses")
vi.mock("@/lib/api/projects")
vi.mock("@/lib/api/datasets")

// Texto de um único widget — sem chamadas de dados (analysisId null).
const dashboard: Dashboard = {
  id: "d1",
  name: "Painel",
  description: "",
  widgets: [
    {
      id: "w1",
      analysisId: null,
      layout: { x: 0, y: 0, w: 6, h: 4 },
      config: { type: "text", title: "Nota", content: "Olá" },
      pageId: "p1",
    },
  ],
  filters: [],
  appearance: {},
  projectId: null,
  createdBy: null,
  createdAt: "",
  updatedAt: "",
  pages: [{ id: "p1", name: "Página 1" }],
  activePageId: "p1",
}

describe("DashboardBuilder — persistência do canvas livre", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(dashboardsApi.updateDashboard).mockImplementation(async (_id, payload) => ({
      ...dashboard,
      appearance: payload.appearance,
      widgets: payload.widgets!.map((w) => ({
        id: w.id,
        analysisId: w.analysisId,
        layout: w.layout,
        config: w.widget,
        pageId: w.pageId,
      })),
    }))
    vi.mocked(analysesApi.getAnalyses).mockResolvedValue([])
    vi.mocked(projectsApi.getProject).mockResolvedValue(null as never)
    vi.mocked(datasetsApi.getDistinctValues).mockResolvedValue({ result: [] })
  })

  it("ao arrastar um widget, grava geometria pixel no layoutDocument e espelho grade em layout", async () => {
    const user = userEvent.setup()
    render(<DashboardBuilder dashboard={dashboard} onDashboardChange={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: /Editar/i }))
    const handle = document.querySelector('[data-stage-handle="w1"]') as HTMLElement
    expect(handle).toBeTruthy()

    fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 200, clientY: 50 })
    fireEvent.pointerUp(window)

    await waitFor(() => {
      expect(dashboardsApi.updateDashboard).toHaveBeenCalled()
    })

    const payload = vi.mocked(dashboardsApi.updateDashboard).mock.calls.at(-1)![1]
    const object = payload.appearance?.layoutDocument?.objects.w1
    // pixel-authoritative: {200, 50, 960, 384}
    expect(object).toMatchObject({ x: 200, y: 50, w: 960, h: 384, unit: "pixel" })
    // espelho grade: 200/160≈1, 50/96≈1, 6×4 células
    expect(payload.widgets?.[0].layout).toEqual({ x: 1, y: 1, w: 6, h: 4 })
  })

  it("ao redimensionar, grava a nova geometria pixel e o espelho arredondado", async () => {
    const user = userEvent.setup()
    render(<DashboardBuilder dashboard={dashboard} onDashboardChange={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: /Editar/i }))
    // seleciona o widget para expor os handles
    fireEvent.click(screen.getByText("Olá"))
    const handle = document.querySelector('[data-stage-resize="w1:se"]') as HTMLElement
    expect(handle).toBeTruthy()

    fireEvent.pointerDown(handle, { clientX: 960, clientY: 384, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 1120, clientY: 480 })
    fireEvent.pointerUp(window)

    await waitFor(() => {
      expect(dashboardsApi.updateDashboard).toHaveBeenCalled()
    })

    const payload = vi.mocked(dashboardsApi.updateDashboard).mock.calls.at(-1)![1]
    const object = payload.appearance?.layoutDocument?.objects.w1
    expect(object).toMatchObject({ x: 0, y: 0, w: 1120, h: 480, unit: "pixel" })
    expect(payload.widgets?.[0].layout).toEqual({ x: 0, y: 0, w: 7, h: 5 })
  })
})
