import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { WorkspaceSourcesPanel } from "./workspace-sources-panel"
import type { SourceListItem } from "@/lib/api/sources"
import type { SourceDataset } from "@/hooks/use-project-sources"
import type { Analysis } from "@/lib/types/analysis"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}))

const sources: SourceListItem[] = [
  { id: 1, database_name: "CNES", engine: "postgresql" },
  { id: 2, database_name: "SIH", engine: "postgresql" },
]

const datasets: SourceDataset[] = [
  {
    id: 10,
    table_name: "monisus_ds_estabelecimentos_123abc",
    schema: "public",
    extra: JSON.stringify({ monisus_display_name: "Estabelecimentos" }),
  },
  { id: 11, table_name: "profissionais", schema: "public" },
]

const analyses: Analysis[] = [
  {
    id: "a-1",
    name: "Leitos por município",
    description: "",
    sql: "select 1",
    databaseId: 1,
    dbSchema: "public",
    datasetId: 10,
    chartType: "bar",
    dimension: "municipio",
    metric: "total",
    chartConfig: null,
    projectId: "p1",
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
  },
]

function baseProps(
  overrides: Partial<
    React.ComponentProps<typeof WorkspaceSourcesPanel>
  > = {}
) {
  return {
    projectId: "p1",
    projectName: "Hospital X",
    selectedDatasetId: null,
    selectedDatasetName: null,
    sources,
    sourcesLoading: false,
    sourcesError: null,
    expandedSourceId: null,
    datasets: [],
    datasetsLoading: false,
    datasetsError: null,
    onToggleSource: vi.fn(),
    onSelectDatasetById: vi.fn(),
    analyses,
    ...overrides,
  }
}

describe("WorkspaceSourcesPanel", () => {
  it("mostra o contexto da sessão com o projeto e a fonte ativa", () => {
    render(
      <WorkspaceSourcesPanel
        {...baseProps({
          selectedDatasetName: "estabelecimentos",
        })}
      />
    )

    expect(screen.getByText("Hospital X")).toBeInTheDocument()
    expect(screen.getByText("Fonte ativa")).toBeInTheDocument()
    expect(screen.getByText("estabelecimentos")).toBeInTheDocument()
  })

  it("lista apenas as fontes do projeto (escopo do projeto)", () => {
    render(<WorkspaceSourcesPanel {...baseProps()} />)

    expect(screen.getByText("CNES")).toBeInTheDocument()
    expect(screen.getByText("SIH")).toBeInTheDocument()
    expect(screen.getByText("Fontes do projeto")).toBeInTheDocument()
  })

  it("recolhe a sidebar pelo controle na própria seção de fontes", async () => {
    const user = userEvent.setup()
    const onCollapse = vi.fn()
    render(<WorkspaceSourcesPanel {...baseProps({ onCollapse })} />)

    const collapseButton = screen.getByRole("button", { name: "Recolher fontes" })
    expect(collapseButton.parentElement).toContainElement(
      screen.getByText("Sessão do projeto")
    )

    await user.click(collapseButton)
    expect(onCollapse).toHaveBeenCalledOnce()
  })

  it("expandir uma fonte dispara onToggleSource com o id", async () => {
    const user = userEvent.setup()
    const onToggleSource = vi.fn()
    render(<WorkspaceSourcesPanel {...baseProps({ onToggleSource })} />)

    await user.click(screen.getByRole("button", { name: /CNES/ }))
    expect(onToggleSource).toHaveBeenCalledWith(1)
  })

  it("com fonte expandida lista os datasets publicados e seleciona por id", async () => {
    const user = userEvent.setup()
    const onSelectDatasetById = vi.fn()
    render(
      <WorkspaceSourcesPanel
        {...baseProps({
          expandedSourceId: 1,
          datasets,
          onSelectDatasetById,
        })}
      />
    )

    expect(screen.getByText("Estabelecimentos")).toBeInTheDocument()
    expect(
      screen.queryByText("monisus_ds_estabelecimentos_123abc")
    ).not.toBeInTheDocument()
    expect(screen.getByText("profissionais")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /Estabelecimentos/ }))
    expect(onSelectDatasetById).toHaveBeenCalledWith(10)
  })

  it("mostra estados de loading e erro das fontes", () => {
    const { rerender } = render(
      <WorkspaceSourcesPanel {...baseProps({ sourcesLoading: true })} />
    )
    expect(screen.getByText("Carregando fontes...")).toBeInTheDocument()

    rerender(
      <WorkspaceSourcesPanel
        {...baseProps({ sourcesLoading: false, sourcesError: "Sem acesso" })}
      />
    )
    expect(screen.getByText("Sem acesso")).toBeInTheDocument()
  })

  it("linka para gerenciar fontes e ver todas as análises (rotas existentes)", () => {
    render(<WorkspaceSourcesPanel {...baseProps()} />)

    expect(
      screen.getByRole("link", { name: /Gerenciar fontes/ })
    ).toHaveAttribute("href", "/projetos/p1/fontes")
    expect(
      screen.getByRole("link", { name: /Ver todas as análises/ })
    ).toHaveAttribute("href", "/projetos/p1/analises")
  })

  it("lista análises recentes com link de restauração", () => {
    render(<WorkspaceSourcesPanel {...baseProps()} />)

    const analysisLink = screen.getByRole("link", {
      name: /Leitos por município/,
    })
    expect(analysisLink).toHaveAttribute(
      "href",
      "/projetos/p1/explorar?analysisId=a-1"
    )
  })

  it("mantém o estado de carregamento enquanto as análises são nulas", () => {
    render(<WorkspaceSourcesPanel {...baseProps({ analyses: null })} />)

    expect(screen.getByText("Carregando análises...")).toBeInTheDocument()
  })
})
