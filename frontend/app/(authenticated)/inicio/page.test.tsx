import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import InicioPage from "./page"
import * as projectsApi from "@/lib/api/projects"
import * as dashboardsApi from "@/lib/api/dashboards"
import * as analysesApi from "@/lib/api/analyses"
import * as datasetsApi from "@/lib/api/datasets"
import type { Project } from "@/lib/types/project"
import type { Dashboard } from "@/lib/types/dashboard"
import type { Analysis } from "@/lib/types/analysis"

const push = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}))

vi.mock("@/lib/api/projects")
vi.mock("@/lib/api/dashboards")
vi.mock("@/lib/api/analyses")
vi.mock("@/lib/api/datasets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/datasets")>()
  return { ...actual, listDatasets: vi.fn() }
})

const projectFixture: Project = {
  id: "p1",
  name: "Saúde da Família",
  description: "Atenção básica",
  analysisCount: 2,
  chartCount: 1,
  dashboardCount: 1,
  sourceCount: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-02-01T10:00:00.000Z",
}

const dashboardFixture: Dashboard = {
  id: "d1",
  name: "Ocupação hospitalar",
  description: "",
  widgets: [],
  filters: [],
  appearance: {},
  projectId: "p1",
  createdBy: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-03-01T10:00:00.000Z",
  pages: [{ id: "pg1", name: "Página 1" }],
  activePageId: "pg1",
}

const analysisFixture: Analysis = {
  id: "a1",
  name: "Internações por mês",
  description: "",
  sql: "SELECT 1",
  databaseId: 1,
  dbSchema: null,
  datasetId: 10,
  chartType: "bar",
  dimension: "mes",
  metric: "total",
  chartConfig: null,
  projectId: "p1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-02-15T10:00:00.000Z",
}

describe("InicioPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(projectsApi.getProjects).mockResolvedValue([projectFixture])
    vi.mocked(dashboardsApi.getDashboards).mockResolvedValue([dashboardFixture])
    vi.mocked(analysesApi.getAnalyses).mockResolvedValue([analysisFixture])
    vi.mocked(datasetsApi.listDatasets).mockResolvedValue({
      count: 1,
      result: [
        {
          id: 10,
          table_name: "internacoes",
          schema: "public",
          description: null,
          extra: null,
          database: { id: 1, database_name: "SUS" },
          columns: [],
        },
      ],
    })
  })

  it("apresenta saudação, projetos reais e continuação", async () => {
    render(<InicioPage />)

    expect(
      screen.getByRole("heading", { name: "O que vamos investigar hoje?" })
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText("Buscar projetos, painéis, análises e dados")
    ).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText("Saúde da Família")).toBeInTheDocument()
    })
    expect(screen.getByText("1 painel")).toBeInTheDocument()
    expect(screen.getByText("2 análises")).toBeInTheDocument()

    // continue: painel (mais recente) e análise com links reais
    expect(screen.getByText("Ocupação hospitalar")).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: /Ocupação hospitalar/ })
    ).toHaveAttribute("href", "/projetos/p1/paineis/d1")
    expect(
      screen.getByRole("link", { name: /Internações por mês/ })
    ).toHaveAttribute("href", "/projetos/p1/analises/a1")

    // comece algo novo
    for (const action of ["Novo projeto", "Novo painel", "Nova análise", "Conectar fonte"]) {
      expect(screen.getByRole("button", { name: new RegExp(action) })).toBeInTheDocument()
    }
  })

  it("busca global por projetos, painéis, análises e dados", async () => {
    const user = userEvent.setup()
    render(<InicioPage />)

    await waitFor(() => {
      expect(screen.getByText("Saúde da Família")).toBeInTheDocument()
    })

    await user.type(
      screen.getByLabelText("Buscar projetos, painéis, análises e dados"),
      "intern"
    )

    expect(await screen.findByText("Dados")).toBeInTheDocument()
    expect(screen.getByText("internacoes")).toBeInTheDocument()
    expect(screen.getByText("Análises")).toBeInTheDocument()

    await user.clear(
      screen.getByLabelText("Buscar projetos, painéis, análises e dados")
    )
    await user.type(
      screen.getByLabelText("Buscar projetos, painéis, análises e dados"),
      "zzz-inexistente"
    )
    expect(await screen.findByText(/Nada encontrado para/)).toBeInTheDocument()
  })

  it("cria projeto e entra nele pelo Comece algo novo", async () => {
    const user = userEvent.setup()
    const { createProject } = await import("@/lib/api/projects")
    vi.mocked(createProject).mockResolvedValue({ ...projectFixture, id: "p9", name: "Novo" })
    render(<InicioPage />)

    await waitFor(() => {
      expect(screen.getByText("Saúde da Família")).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: /Novo projeto/ }))
    await user.type(screen.getByLabelText("Nome *"), "Novo")
    await user.click(screen.getByRole("button", { name: "Criar projeto" }))

    await waitFor(() => {
      expect(createProject).toHaveBeenCalledWith({ name: "Novo", description: null })
    })
    expect(push).toHaveBeenCalledWith("/projetos/p9")
  })

  it("nova análise escolhe o projeto para preservar o vínculo", async () => {
    const user = userEvent.setup()
    render(<InicioPage />)

    await waitFor(() => {
      expect(screen.getByText("Saúde da Família")).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: /Nova análise/ }))
    expect(await screen.findByText(/onde a análise será salva/)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /Saúde da Família/ }))
    expect(push).toHaveBeenCalledWith("/projetos/p1/explorar")
  })

  it("mostra erro da seção sem esconder as demais", async () => {
    const { ApiError } = await import("@/lib/api")
    vi.mocked(datasetsApi.listDatasets).mockRejectedValueOnce(
      new ApiError(500, "Falha nos dados.")
    )
    render(<InicioPage />)

    await waitFor(() => {
      expect(screen.getByText("Saúde da Família")).toBeInTheDocument()
    })
    // projetos e continuação seguem funcionando
    expect(screen.getByText("Ocupação hospitalar")).toBeInTheDocument()
  })
})
