import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { DashboardComponentsDrawer } from "./dashboard-components-drawer"
import * as analysesApi from "@/lib/api/analyses"
import { executeQuery } from "@/lib/api/queries"
import { clearThumbnailCache } from "@/components/dashboard/analysis-thumbnail"
import type { Analysis } from "@/lib/types/analysis"

vi.mock("@/lib/api/analyses")
vi.mock("@/lib/api/queries")
vi.mock("@/components/charts/EChartRenderer", () => ({
  EChartRenderer: () => <div data-testid="echart" />,
}))

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
    chartConfig: null,
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
    chartConfig: null,
    projectId: null,
    createdAt: "2026-01-02T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
  },
]

describe("DashboardComponentsDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(analysesApi.getAnalyses).mockResolvedValue(mockAnalyses)
    vi.mocked(executeQuery).mockResolvedValue({
      status: "success",
      data: [{ municipio: "Campinas", qtd: 10 }],
    })
    clearThumbnailCache()
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

    // A lateral evoluiu de "gráficos" para biblioteca de elementos
    // (filtros, textos, formas, imagens): o título acompanha a intenção.
    expect(screen.getByText("Biblioteca de elementos")).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText("Internações por Município")).toBeInTheDocument()
      expect(screen.getByText("Tabela de Mortalidade")).toBeInTheDocument()
    })

    // Analise 1 já está no painel
    expect(screen.getByText("No painel")).toBeInTheDocument()

    // Elemento arrastável com payload HTML5 para o canvas.
    const item1 = screen.getByText("Internações por Município").closest("[data-analysis-id]")
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

  it("tolera início de arraste sem DataTransfer", async () => {
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

    const item = screen
      .getByText("Internações por Município")
      .closest(".grid-stack-item-drag-in")

    expect(() => fireEvent.dragStart(item!)).not.toThrow()
  })

  it("restringe a busca ao projeto do painel quando projectId é passado", async () => {
    render(
      <DashboardComponentsDrawer
        open={true}
        onClose={vi.fn()}
        onSelectAnalysis={vi.fn()}
        existingAnalysisIds={[]}
        projectId="proj-1"
        projectName="Monitoramento SUS"
      />
    )

    expect(analysesApi.getAnalyses).toHaveBeenCalledWith("proj-1")

    await waitFor(() => {
      expect(
        screen.getByText(/Somente análises do projeto/i)
      ).toBeInTheDocument()
    })
    expect(screen.getByText("Monitoramento SUS")).toBeInTheDocument()
    expect(
      screen.queryByText(/Painel sem projeto/i)
    ).not.toBeInTheDocument()
  })

  it("sem projectId lista todas as análises e avisa que o painel não tem projeto", async () => {
    render(
      <DashboardComponentsDrawer
        open={true}
        onClose={vi.fn()}
        onSelectAnalysis={vi.fn()}
        existingAnalysisIds={[]}
        projectId={null}
      />
    )

    expect(analysesApi.getAnalyses).toHaveBeenCalledWith(undefined)

    await waitFor(() => {
      expect(screen.getByText(/Painel sem projeto/i)).toBeInTheDocument()
    })
    expect(screen.getByText("Internações por Município")).toBeInTheDocument()
    expect(
      screen.queryByText(/Somente análises do projeto/i)
    ).not.toBeInTheDocument()
  })

  it("recarrega quando o projeto do painel muda", async () => {
    const { rerender } = render(
      <DashboardComponentsDrawer
        open={true}
        onClose={vi.fn()}
        onSelectAnalysis={vi.fn()}
        existingAnalysisIds={[]}
        projectId="proj-1"
      />
    )

    await waitFor(() => {
      expect(analysesApi.getAnalyses).toHaveBeenCalledWith("proj-1")
    })

    rerender(
      <DashboardComponentsDrawer
        open={true}
        onClose={vi.fn()}
        onSelectAnalysis={vi.fn()}
        existingAnalysisIds={[]}
        projectId="proj-2"
      />
    )

    await waitFor(() => {
      expect(analysesApi.getAnalyses).toHaveBeenCalledWith("proj-2")
    })
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

  it("dispara onSelectAnalysis ao clicar no card inteiro", async () => {
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

    const card = screen
      .getByText("Internações por Município")
      .closest(".grid-stack-item-drag-in")

    await user.click(card!)

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(mockAnalyses[0])
  })

  it("renderiza as miniaturas buscando uma amostra das linhas", async () => {
    render(
      <DashboardComponentsDrawer
        open={true}
        onClose={vi.fn()}
        onSelectAnalysis={vi.fn()}
        existingAnalysisIds={[]}
      />
    )

    await waitFor(() => {
      expect(screen.getAllByTestId("echart").length).toBeGreaterThan(0)
    })

    expect(executeQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        database_id: 1,
        sql: "SELECT * FROM internacoes",
        limit: 100,
      })
    )
  })

  it("mostra fallback quando a consulta da miniatura falha", async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      status: "error",
      data: [],
      message: "falhou",
    })

    render(
      <DashboardComponentsDrawer
        open={true}
        onClose={vi.fn()}
        onSelectAnalysis={vi.fn()}
        existingAnalysisIds={[]}
      />
    )

    await waitFor(() => {
      expect(screen.getAllByText("Sem pré-visualização").length).toBeGreaterThan(0)
    })
    expect(screen.queryAllByTestId("echart")).toHaveLength(0)
  })

  it("adiciona elementos de texto e forma por clique via onSelectElement", async () => {
    const onSelectElement = vi.fn()
    const user = userEvent.setup()
    render(
      <DashboardComponentsDrawer
        open={true}
        onClose={vi.fn()}
        onSelectAnalysis={vi.fn()}
        onSelectElement={onSelectElement}
        existingAnalysisIds={[]}
      />
    )

    await user.click(screen.getByRole("button", { name: /Bloco de texto/i }))
    expect(onSelectElement).toHaveBeenCalledWith(
      expect.objectContaining({ type: "text", content: "Adicione seu texto" })
    )

    await user.click(screen.getByRole("button", { name: /^Retângulo$/i }))
    expect(onSelectElement).toHaveBeenCalledWith(
      expect.objectContaining({ type: "shape", shape: "rectangle" })
    )
  })

  it("filtra elementos da biblioteca pela busca", async () => {
    const user = userEvent.setup()
    render(
      <DashboardComponentsDrawer
        open={true}
        onClose={vi.fn()}
        onSelectAnalysis={vi.fn()}
        existingAnalysisIds={[]}
      />
    )

    const input = screen.getByPlaceholderText("Buscar por nome ou descrição...")
    await user.type(input, "retângulo")

    expect(screen.getByRole("button", { name: /^Retângulo$/i })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Bloco de texto/i })).not.toBeInTheDocument()
  })

  it("oferece os quatro controles de filtro com o tipo pré-selecionado", async () => {
    const onAddFilter = vi.fn()
    const user = userEvent.setup()
    render(
      <DashboardComponentsDrawer
        open={true}
        onClose={vi.fn()}
        onSelectAnalysis={vi.fn()}
        onAddFilter={onAddFilter}
        existingAnalysisIds={[]}
      />
    )

    await user.click(screen.getByRole("button", { name: /^Seleção múltipla$/i }))
    expect(onAddFilter).toHaveBeenCalledWith("multi-select")

    await user.click(screen.getByRole("button", { name: /^Intervalo de datas$/i }))
    expect(onAddFilter).toHaveBeenCalledWith("date-range")
  })

  it("mantém o item personalizado desabilitado sem executar HTML", async () => {
    const onSelectElement = vi.fn()
    const user = userEvent.setup()
    render(
      <DashboardComponentsDrawer
        open={true}
        onClose={vi.fn()}
        onSelectAnalysis={vi.fn()}
        onSelectElement={onSelectElement}
        existingAnalysisIds={[]}
      />
    )

    await user.click(screen.getByRole("button", { name: /^Personalizados$/i }))

    const custom = screen.getByRole("button", { name: /HTML\/CSS restrito/i })
    await user.click(custom)
    expect(onSelectElement).not.toHaveBeenCalled()
    expect(
      screen.getByText(/JavaScript arbitrário não será executado/i)
    ).toBeInTheDocument()
  })

  it("informa erro de formato inválido no upload de imagem", async () => {
    render(
      <DashboardComponentsDrawer
        open={true}
        onClose={vi.fn()}
        onSelectAnalysis={vi.fn()}
        existingAnalysisIds={[]}
      />
    )

    const file = new File(["texto"], "notas.txt", { type: "text/plain" })
    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /PNG, JPEG ou SVG/i
    )
  })
})
