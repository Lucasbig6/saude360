import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { WorkspaceStudio } from "./workspace-studio"
import { createEmptyStudio, studioReducer } from "@/lib/explorer/studio"
import {
  presentationFromRows,
  type WorkspaceData,
} from "@/lib/explorer/workspace"
import type { StudioState } from "@/lib/explorer/studio"
import type { PresentationState } from "@/lib/explorer/workspace"

vi.mock("@/components/charts/EChartRenderer", () => ({
  EChartRenderer: () => <div data-testid="echart" />,
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}))

function workspaceFixture(
  overrides: Partial<WorkspaceData> = {}
): WorkspaceData {
  return {
    rows: [
      { municipio: "Recife", total: 80 },
      { municipio: "Olinda", total: 40 },
    ],
    rowCount: 2,
    truncated: false,
    executionMs: 42,
    sql: "SELECT municipio, total FROM demo",
    question: "Atendimentos por município?",
    insight: "Recife concentra o volume.",
    source: "agent",
    databaseId: 1,
    dbSchema: "public",
    datasetId: 12,
    datasetName: "demo_atendimentos",
    ...overrides,
  }
}

function pinState(question: string): StudioState {
  const ws = workspaceFixture({ question })
  return studioReducer(createEmptyStudio(), {
    type: "pin",
    workspace: ws,
    presentation: presentationFromRows(ws.rows),
  })
}

function baseProps(overrides: Partial<Parameters<typeof WorkspaceStudio>[0]> = {}) {
  return {
    projectId: "p1",
    studio: createEmptyStudio(),
    onRemove: vi.fn(),
    onPresentationChange: vi.fn<(id: string, p: PresentationState) => void>(),
    onAnalysisSaved: vi.fn(),
    onDatasetPublished: vi.fn(),
    ...overrides,
  }
}

describe("WorkspaceStudio", () => {
  it("mantém vazia a área de fixados sem criar um painel de resultado vazio", () => {
    render(<WorkspaceStudio {...baseProps()} />)

    expect(screen.getByText("Resultados fixados")).toBeInTheDocument()
    expect(screen.getByText("Nenhum resultado fixado.")).toBeInTheDocument()
  })

  it("lista itens fixados com título e metadados próprios", () => {
    const studio = pinState("Qual o total por município?")
    render(<WorkspaceStudio {...baseProps({ studio })} />)

    expect(screen.getByText("Qual o total por município?")).toBeInTheDocument()
    expect(screen.getByText(/demo_atendimentos/)).toBeInTheDocument()
    expect(screen.getByText(/2 linhas/)).toBeInTheDocument()
    expect(screen.getByText(/Recife concentra o volume\./)).toBeInTheDocument()
  })

  it("fixar um novo resultado não sobrescreve os itens já fixados", () => {
    const studio = pinState("Primeira pergunta")
    const { rerender } = render(
      <WorkspaceStudio {...baseProps({ studio })} />
    )

    // Novo draft na conversa (previewProps muda) — item fixado permanece.
    const nextStudio = studioReducer(studio, {
      type: "pin",
      workspace: workspaceFixture({ question: "Segunda pergunta" }),
      presentation: presentationFromRows([]),
    })
    rerender(<WorkspaceStudio {...baseProps({ studio: nextStudio })} />)

    expect(screen.getByText("Primeira pergunta")).toBeInTheDocument()
    expect(screen.getByText("Segunda pergunta")).toBeInTheDocument()
  })

  it("remove um item fixado sem tocar nos demais", async () => {
    const user = userEvent.setup()
    let studio = pinState("Manter")
    studio = studioReducer(studio, {
      type: "pin",
      workspace: workspaceFixture({ question: "Remover" }),
      presentation: presentationFromRows([]),
    })
    const onRemove = vi.fn()

    render(<WorkspaceStudio {...baseProps({ studio, onRemove })} />)

    await user.click(
      screen.getByRole("button", {
        name: 'Remover "Remover" do Estúdio',
      })
    )

    expect(onRemove).toHaveBeenCalledWith(studio.items[0].id)
    // O item "Manter" continua listado (o reducer aplica a remoção).
    expect(screen.getByText("Manter")).toBeInTheDocument()
  })

  it("apresentação editada em um item altera apenas o item fixado", async () => {
    const user = userEvent.setup()
    const studio = pinState("Item fixado")
    const onPresentationChange = vi.fn()
    render(
      <WorkspaceStudio
        {...baseProps({ studio, onPresentationChange })}
      />
    )

    // Alterna para tabela no item fixado (AgentViz do StudioItemCard).
    const group = screen.getAllByLabelText(
      "Modo de visualização do resultado"
    )[0]
    await user.click(
      within(group).getByRole("button", { name: "Tabela" })
    )

    // A troca é endereçada ao item fixado, não ao draft.
    expect(onPresentationChange).toHaveBeenCalledWith(
      studio.items[0].id,
      expect.objectContaining({ viewMode: "table" })
    )
  })
})
