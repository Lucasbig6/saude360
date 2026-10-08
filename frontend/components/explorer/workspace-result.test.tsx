import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { WorkspaceResult } from "./workspace-result"
import {
  presentationFromRows,
  type WorkspaceData,
} from "@/lib/explorer/workspace"

vi.mock("@/components/charts/EChartRenderer", () => ({
  EChartRenderer: () => <div data-testid="echart" />,
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}))

function buildWorkspace(
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

function renderResult(
  workspace: WorkspaceData,
  extra: { hideExplanation?: boolean } = {}
) {
  const onEditVisual = vi.fn()
  const onAnalysisSaved = vi.fn()
  const onDatasetPublished = vi.fn()
  render(
    <WorkspaceResult
      workspace={workspace}
      presentation={presentationFromRows(workspace.rows)}
      onPresentationChange={vi.fn()}
      projectId="p1"
      streaming={false}
      statusText={null}
      trace={[]}
      error={null}
      onRetry={vi.fn()}
      onAbort={vi.fn()}
      pendingConfirmation={null}
      onConfirm={vi.fn()}
      onDismissConfirmation={vi.fn()}
      editingAnalysis={null}
      onAnalysisSaved={onAnalysisSaved}
      onDatasetPublished={onDatasetPublished}
      onEditVisual={onEditVisual}
      hideExplanation={extra.hideExplanation}
    />
  )
  return { onEditVisual, onAnalysisSaved, onDatasetPublished }
}

describe("WorkspaceResult", () => {
  it("renderiza título da pergunta, gráfico e insights calculados", () => {
    renderResult(buildWorkspace())

    expect(screen.getByText("Atendimentos por município?")).toBeTruthy()
    expect(screen.getByText(/demo_atendimentos · 2 linha/)).toBeTruthy()
    expect(screen.getByTestId("echart")).toBeTruthy()
    expect(screen.queryByText("Insights")).toBeNull()
    expect(screen.getByText("Recife concentra o volume.")).toBeTruthy()
  })

  it("renderiza a explicação da IA como Markdown (tabela, código, lista)", () => {
    renderResult(
      buildWorkspace({
        insight: [
          "**Meses**",
          "",
          "| Mês | Total |",
          "| --- | --- |",
          "| Janeiro | 8 403 |",
          "",
          "```sql",
          "SELECT 1",
          "```",
          "",
          "- item um",
        ].join("\n"),
      })
    )

    expect(screen.getByText("Meses").tagName).toBe("STRONG")
    expect(screen.getByRole("table")).toBeTruthy()
    expect(screen.getByText("Janeiro")).toBeTruthy()
    expect(screen.getByText("SELECT 1")).toBeTruthy()
    expect(screen.getByText("item um")).toBeTruthy()
  })

  it("oculta a explicação com hideExplanation, mantendo gráfico e ações", () => {
    renderResult(buildWorkspace(), { hideExplanation: true })

    expect(screen.getByTestId("echart")).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Salvar análise" })
    ).toBeTruthy()
    expect(screen.queryByText("Recife concentra o volume.")).toBeNull()
  })

  it("usa título de tabela para fonte SQL sem pergunta", () => {
    renderResult(
      buildWorkspace({ source: "sql", question: null, datasetName: "demo" })
    )
    expect(screen.getByText("Resultado de demo")).toBeTruthy()
  })

  it("expõe as ações e chama Editar visual", async () => {
    const user = userEvent.setup()
    const { onEditVisual } = renderResult(buildWorkspace())

    expect(
      screen.getByRole("button", { name: "Salvar análise" })
    ).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Adicionar ao painel" })
    ).toBeDisabled()

    await user.click(screen.getByRole("button", { name: "Editar visual" }))
    expect(onEditVisual).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole("button", { name: "Ver SQL" }))
    expect(screen.getByText(/SELECT municipio/)).toBeTruthy()
  })

  it("mostra erro com tentar novamente", async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(
      <WorkspaceResult
        workspace={buildWorkspace({ rows: [] })}
        presentation={presentationFromRows([])}
        onPresentationChange={vi.fn()}
        projectId="p1"
        streaming={false}
        statusText={null}
        trace={[]}
        error="Falha na consulta."
        onRetry={onRetry}
        onAbort={vi.fn()}
        pendingConfirmation={null}
        onConfirm={vi.fn()}
        onDismissConfirmation={vi.fn()}
        editingAnalysis={null}
        onAnalysisSaved={vi.fn()}
        onDatasetPublished={vi.fn()}
        onEditVisual={vi.fn()}
      />
    )
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
