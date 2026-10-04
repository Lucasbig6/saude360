import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { AddToDashboardDialog } from "./add-to-dashboard-dialog"
import * as dashboardsApi from "@/lib/api/dashboards"
import type { Analysis } from "@/lib/types/analysis"
import type { Dashboard } from "@/lib/types/dashboard"

const push = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
}))

vi.mock("@/lib/api/dashboards", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/dashboards")>()),
  getDashboards: vi.fn(),
  createDashboard: vi.fn(),
  updateDashboard: vi.fn(),
}))

function makeAnalysis(overrides: Partial<Analysis> = {}): Analysis {
  return {
    id: "a1",
    name: "Internações por município",
    description: "SIH",
    chartType: "bar",
    sql: "SELECT * FROM internacoes",
    databaseId: 1,
    dbSchema: "public",
    datasetId: 10,
    dimension: "municipio",
    metric: "qtd",
    chartConfig: null,
    projectId: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

function makeDashboard(overrides: Partial<Dashboard> = {}): Dashboard {
  return {
    id: "d1",
    name: "Painel de indicadores",
    description: "",
    widgets: [],
    filters: [],
    projectId: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

describe("AddToDashboardDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(dashboardsApi.getDashboards).mockResolvedValue([])
  })

  it("lista só os painéis do projeto da análise", async () => {
    vi.mocked(dashboardsApi.getDashboards).mockResolvedValue([
      makeDashboard({ id: "d-p1", name: "Painel do projeto", projectId: "p1" }),
    ])

    render(
      <AddToDashboardDialog
        open={true}
        onOpenChange={vi.fn()}
        analysis={makeAnalysis({ projectId: "p1" })}
      />
    )

    await waitFor(() => {
      expect(dashboardsApi.getDashboards).toHaveBeenCalledWith("p1")
    })
    expect(await screen.findByText("Painel do projeto")).toBeInTheDocument()
    expect(
      screen.queryByText(/não tem projeto vinculado/i)
    ).not.toBeInTheDocument()
  })

  it("sem projeto na análise lista todos e avisa", async () => {
    vi.mocked(dashboardsApi.getDashboards).mockResolvedValue([
      makeDashboard({ name: "Qualquer painel" }),
    ])

    render(
      <AddToDashboardDialog
        open={true}
        onOpenChange={vi.fn()}
        analysis={makeAnalysis({ projectId: null })}
      />
    )

    await waitFor(() => {
      expect(dashboardsApi.getDashboards).toHaveBeenCalledWith(undefined)
    })
    expect(
      await screen.findByText(/não tem projeto vinculado/i)
    ).toBeInTheDocument()
  })

  it("cria o painel novo no mesmo projeto da análise", async () => {
    vi.mocked(dashboardsApi.createDashboard).mockResolvedValue(makeDashboard())

    const user = userEvent.setup()
    render(
      <AddToDashboardDialog
        open={true}
        onOpenChange={vi.fn()}
        analysis={makeAnalysis({ projectId: "p1" })}
      />
    )

    await waitFor(() => {
      expect(dashboardsApi.getDashboards).toHaveBeenCalledWith("p1")
    })

    await user.click(await screen.findByText("Novo dashboard"))
    await user.type(screen.getByLabelText(/Nome do dashboard/i), "Novo painel")
    await user.click(screen.getByRole("button", { name: /Criar e adicionar/i }))

    await waitFor(() => {
      expect(dashboardsApi.createDashboard).toHaveBeenCalledTimes(1)
    })

    const payload = vi.mocked(dashboardsApi.createDashboard).mock.calls[0][0]
    expect(payload.name).toBe("Novo painel")
    expect(payload.projectId).toBe("p1")
    expect(payload.widgets).toHaveLength(1)
    expect(payload.widgets?.[0]?.analysisId).toBe("a1")
  })

  it("cria sem projeto quando a análise também não tem", async () => {
    vi.mocked(dashboardsApi.createDashboard).mockResolvedValue(makeDashboard())

    const user = userEvent.setup()
    render(
      <AddToDashboardDialog
        open={true}
        onOpenChange={vi.fn()}
        analysis={makeAnalysis({ projectId: null })}
      />
    )

    await waitFor(() => {
      expect(dashboardsApi.getDashboards).toHaveBeenCalled()
    })

    await user.click(await screen.findByText("Novo dashboard"))
    await user.type(screen.getByLabelText(/Nome do dashboard/i), "Painel solto")
    await user.click(screen.getByRole("button", { name: /Criar e adicionar/i }))

    await waitFor(() => {
      expect(dashboardsApi.createDashboard).toHaveBeenCalledTimes(1)
    })

    const payload = vi.mocked(dashboardsApi.createDashboard).mock.calls[0][0]
    expect(payload.projectId).toBeUndefined()
  })

  it("adiciona widget ao painel escolhido", async () => {
    vi.mocked(dashboardsApi.getDashboards).mockResolvedValue([
      makeDashboard({ id: "d1", name: "Painel destino" }),
    ])
    vi.mocked(dashboardsApi.updateDashboard).mockResolvedValue(
      makeDashboard({ id: "d1" })
    )

    const user = userEvent.setup()
    render(
      <AddToDashboardDialog
        open={true}
        onOpenChange={vi.fn()}
        analysis={makeAnalysis({ projectId: "p1" })}
      />
    )

    await user.click(await screen.findByText("Painel destino"))

    await waitFor(() => {
      expect(dashboardsApi.updateDashboard).toHaveBeenCalledTimes(1)
    })
    expect(dashboardsApi.createDashboard).not.toHaveBeenCalled()
  })
})
