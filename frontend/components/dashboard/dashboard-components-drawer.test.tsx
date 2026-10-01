import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { DashboardComponentsDrawer } from "./dashboard-components-drawer"
import * as analysesApi from "@/lib/api/analyses"
import type { Analysis } from "@/lib/types/analysis"

vi.mock("@/lib/api/analyses")

const mockAnalyses: Analysis[] = [
  {
    id: "analise-1",
    name: "Internações por Município",
    description: "Distribuição geográfica do SIH",
    chartType: "bar",
    sql: "SELECT * FROM internacoes",
    databaseId: 1,
    dbSchema: "public",
    datasetId: 10,
    dimension: "municipio",
    metric: "qtd",
    projectId: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "analise-2",
    name: "Tabela de Mortalidade",
    description: "Registros de óbitos por causa",
    chartType: "table",
    sql: "SELECT * FROM obitos",
    databaseId: 1,
    dbSchema: "public",
    datasetId: 11,
    dimension: null,
    metric: null,
    projectId: null,
    createdAt: "2026-01-02T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
  },
]

describe("DashboardComponentsDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(analysesApi.getAnalyses).mockResolvedValue(mockAnalyses)
  })

  it("não renderiza nada quando open é false", () => {
    const { container } = render(
      <DashboardComponentsDrawer
        open={false}
        onClose={vi.fn()}
        onSelectAnalysis={vi.fn()}
        existingAnalysisIds={[]}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it("renderiza lista de análises e atributos de drag quando open é true", async () => {
    render(
      <DashboardComponentsDrawer
        open={true}
        onClose={vi.fn()}
        onSelectAnalysis={vi.fn()}
        existingAnalysisIds={["analise-1"]}
      />
    )

    expect(screen.getByText("Biblioteca de Gráficos")).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText("Internações por Município")).toBeInTheDocument()
      expect(screen.getByText("Tabela de Mortalidade")).toBeInTheDocument()
    })

    // Analise 1 já está no painel
    expect(screen.getByText("No painel")).toBeInTheDocument()

    // Elemento arrastável com classe do GridStack
    const item1 = screen.getByText("Internações por Município").closest(".grid-stack-item-drag-in")
    expect(item1).toHaveAttribute("data-analysis-id", "analise-1")
    expect(item1).toHaveAttribute("draggable", "true")
  })

  it("filtra análises pela busca de texto", async () => {
    const user = userEvent.setup()
    render(
      <DashboardComponentsDrawer
        open={true}
        onClose={vi.fn()}
        onSelectAnalysis={vi.fn()}
        existingAnalysisIds={[]}
      />
    )

    await waitFor(() => {
      expect(screen.getByText("Internações por Município")).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText("Buscar por nome ou descrição...")
    await user.type(input, "Mortalidade")

    expect(screen.queryByText("Internações por Município")).not.toBeInTheDocument()
    expect(screen.getByText("Tabela de Mortalidade")).toBeInTheDocument()
  })

  it("filtra por categoria (Gráficos vs Tabelas)", async () => {
    const user = userEvent.setup()
    render(
      <DashboardComponentsDrawer
        open={true}
        onClose={vi.fn()}
        onSelectAnalysis={vi.fn()}
        existingAnalysisIds={[]}
      />
    )

    await waitFor(() => {
      expect(screen.getByText("Internações por Município")).toBeInTheDocument()
    })

    // Clica no filtro "Tabelas"
    const tablesBtn = screen.getByRole("button", { name: /Tabelas/i })
    await user.click(tablesBtn)

    expect(screen.queryByText("Internações por Município")).not.toBeInTheDocument()
    expect(screen.getByText("Tabela de Mortalidade")).toBeInTheDocument()

    // Clica no filtro "Gráficos"
    const chartsBtn = screen.getByRole("button", { name: /^Gráficos$/i })
    await user.click(chartsBtn)

    expect(screen.getByText("Internações por Município")).toBeInTheDocument()
    expect(screen.queryByText("Tabela de Mortalidade")).not.toBeInTheDocument()
  })

  it("dispara onSelectAnalysis ao clicar no botão +", async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()

    render(
      <DashboardComponentsDrawer
        open={true}
        onClose={vi.fn()}
        onSelectAnalysis={onSelect}
        existingAnalysisIds={[]}
      />
    )

    await waitFor(() => {
      expect(screen.getByText("Internações por Município")).toBeInTheDocument()
    })

    const addButtons = screen.getAllByTitle("Adicionar ao final do painel")
    await user.click(addButtons[0])

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(mockAnalyses[0])
  })

  it("dispara onClose ao clicar no botão de fechar", async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()

    render(
      <DashboardComponentsDrawer
        open={true}
        onClose={onClose}
        onSelectAnalysis={vi.fn()}
        existingAnalysisIds={[]}
      />
    )

    const closeBtn = screen.getByTitle("Fechar biblioteca")
    await user.click(closeBtn)

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
