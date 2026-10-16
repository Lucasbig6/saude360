import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ProjectHome } from "./project-home"
import * as projectsApi from "@/lib/api/projects"
import { ApiError } from "@/lib/api"
import type { Project } from "@/lib/types/project"

const push = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}))

vi.mock("@/lib/api/projects", () => ({
  getProjects: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
}))

const projectFixture: Project = {
  id: "p1",
  name: "Saúde da Família",
  description: "Indicadores da atenção básica",
  analysisCount: 3,
  chartCount: 5,
  dashboardCount: 2,
  sourceCount: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-02-01T10:00:00.000Z",
}

const secondFixture: Project = {
  ...projectFixture,
  id: "p2",
  name: "Vigilância",
  description: "",
  analysisCount: 1,
  chartCount: 0,
  dashboardCount: 0,
}

describe("ProjectHome", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    try {
      window.localStorage?.clear()
    } catch {
      // jsdom sem storage: a recência fica sem efeito nos testes
    }
    vi.mocked(projectsApi.getProjects).mockResolvedValue([projectFixture, secondFixture])
  })

  it("prioriza projetos com busca, contagens reais e data de atualização", async () => {
    render(<ProjectHome />)

    expect(screen.getByRole("heading", { name: "Projetos" })).toBeInTheDocument()
    expect(
      screen.getByText("Organize suas análises, painéis e dados em um só lugar.")
    ).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText("Saúde da Família")).toBeInTheDocument()
    })
    expect(screen.getByText("2 painéis")).toBeInTheDocument()
    expect(screen.getByText("3 análises")).toBeInTheDocument()
    expect(screen.getAllByText(/Atualizado em/)).toHaveLength(2)
    // sem cards genéricos de atalho
    expect(screen.queryByText("Conjuntos de dados")).not.toBeInTheDocument()
  })

  it("filtra por nome ou descrição", async () => {
    const user = userEvent.setup()
    render(<ProjectHome />)

    await waitFor(() => {
      expect(screen.getByText("Saúde da Família")).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText("Buscar projeto"), "vigil")
    expect(screen.queryByText("Saúde da Família")).not.toBeInTheDocument()
    expect(screen.getByText("Vigilância")).toBeInTheDocument()

    await user.clear(screen.getByLabelText("Buscar projeto"))
    await user.type(screen.getByLabelText("Buscar projeto"), "termo-inexistente")
    expect(
      screen.getByText(/Nenhum projeto encontrado para/)
    ).toBeInTheDocument()
  })

  it("alterna entre grade e lista", async () => {
    const user = userEvent.setup()
    render(<ProjectHome />)

    await waitFor(() => {
      expect(screen.getByText("Saúde da Família")).toBeInTheDocument()
    })

    await user.click(screen.getByTitle("Visualização em lista"))
    expect(screen.getByTitle("Visualização em lista")).toHaveAttribute(
      "aria-pressed",
      "true"
    )

    await user.click(screen.getByTitle("Visualização em grade"))
    expect(screen.getByTitle("Visualização em grade")).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })

  it("cria o projeto pela API e entra nele sem recarga manual", async () => {
    const user = userEvent.setup()
    vi.mocked(projectsApi.createProject).mockResolvedValue({
      ...projectFixture,
      id: "p3",
      name: "Novo",
    })
    render(<ProjectHome />)

    await waitFor(() => {
      expect(screen.getByText("Saúde da Família")).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: "Novo projeto" }))
    await user.type(screen.getByLabelText("Nome *"), "Novo")
    await user.click(screen.getByRole("button", { name: "Criar projeto" }))

    await waitFor(() => {
      expect(projectsApi.createProject).toHaveBeenCalledWith({
        name: "Novo",
        description: null,
      })
    })
    expect(push).toHaveBeenCalledWith("/projetos/p3")
  })

  it("exige nome para criar", async () => {
    const user = userEvent.setup()
    render(<ProjectHome />)

    await waitFor(() => {
      expect(screen.getByText("Saúde da Família")).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: "Novo projeto" }))
    expect(screen.getByRole("button", { name: "Criar projeto" })).toBeDisabled()
    expect(projectsApi.createProject).not.toHaveBeenCalled()
  })

  it("renomeia pelo menu contextual", async () => {
    const user = userEvent.setup()
    vi.mocked(projectsApi.updateProject).mockResolvedValue({
      ...projectFixture,
      name: "Renomeado",
    })
    render(<ProjectHome />)

    await waitFor(() => {
      expect(screen.getByText("Saúde da Família")).toBeInTheDocument()
    })

    await user.click(screen.getByLabelText("Ações de Saúde da Família"))
    await user.click(await screen.findByRole("menuitem", { name: /Renomear/ }))
    const input = screen.getByLabelText("Nome *")
    await user.clear(input)
    await user.type(input, "Renomeado")
    await user.click(screen.getByRole("button", { name: "Salvar" }))

    await waitFor(() => {
      expect(projectsApi.updateProject).toHaveBeenCalledWith("p1", {
        name: "Renomeado",
        description: "Indicadores da atenção básica",
      })
    })
    expect(await screen.findByText("Renomeado")).toBeInTheDocument()
  })

  it("exclui com confirmação e mostra erro de autorização sem mascarar", async () => {
    const user = userEvent.setup()
    vi.mocked(projectsApi.deleteProject).mockRejectedValueOnce(
      new ApiError(403, "Acesso negado.")
    )
    render(<ProjectHome />)

    await waitFor(() => {
      expect(screen.getByText("Vigilância")).toBeInTheDocument()
    })

    await user.click(screen.getByLabelText("Ações de Vigilância"))
    await user.click(await screen.findByRole("menuitem", { name: "Excluir" }))
    await user.click(await screen.findByRole("button", { name: "Excluir" }))

    await waitFor(() => {
      expect(projectsApi.deleteProject).toHaveBeenCalledWith("p2")
    })
    // 403 exibido; o projeto continua na lista
    expect(await screen.findByText("Acesso negado.")).toBeInTheDocument()
    expect(screen.getByText("Vigilância")).toBeInTheDocument()
  })

  it("mostra erro com nova tentativa quando a listagem falha", async () => {
    const user = userEvent.setup()
    vi.mocked(projectsApi.getProjects).mockRejectedValueOnce(
      new ApiError(500, "Falha no servidor.")
    )
    render(<ProjectHome />)

    expect(await screen.findByText("Falha no servidor.")).toBeInTheDocument()

    vi.mocked(projectsApi.getProjects).mockResolvedValue([projectFixture])
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }))
    expect(await screen.findByText("Saúde da Família")).toBeInTheDocument()
  })

  it("mostra estado vazio com ação de criar", async () => {
    const user = userEvent.setup()
    vi.mocked(projectsApi.getProjects).mockResolvedValue([])
    render(<ProjectHome />)

    expect(await screen.findByText("Nenhum projeto ainda")).toBeInTheDocument()
    const actions = screen.getAllByRole("button", { name: "Novo projeto" })
    expect(actions).toHaveLength(2)
    await user.click(actions[1])
    expect(await screen.findByText(/Dê um nome para o projeto/)).toBeInTheDocument()
  })
})
