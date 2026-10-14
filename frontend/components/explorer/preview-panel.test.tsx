import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { PreviewPanel, type PreviewPanelProps } from "./preview-panel"
import {
  presentationFromRows,
  type WorkspaceData,
} from "@/lib/explorer/workspace"
import { DEFAULT_DISPLAY_OPTIONS } from "@/lib/charts/display-options"
import type { AnalysisFilter } from "@/lib/charts/chart-config"

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

function baseProps(
  overrides: Partial<PreviewPanelProps> = {}
): PreviewPanelProps {
  const rows = [
    { municipio: "Recife", total: 80 },
    { municipio: "Olinda", total: 40 },
  ]
  return {
    workspace: workspaceFixture(),
    presentation: presentationFromRows(rows),
    onPresentationChange: vi.fn(),
    filters: [],
    streaming: false,
    statusText: null,
    error: null,
    pendingConfirmation: null,
    onRetry: vi.fn(),
    onAbort: vi.fn(),
    onConfirm: vi.fn(),
    onDismiss: vi.fn(),
    projectId: "p1",
    editingAnalysis: null,
    onAnalysisSaved: vi.fn(),
    onDatasetPublished: vi.fn(),
    onEditVisual: vi.fn(),
    ...overrides,
  }
}

describe("PreviewPanel", () => {
  it("mostra o estado vazio quando nada foi executado ainda", () => {
    render(<PreviewPanel {...baseProps({ workspace: null })} />)

    expect(
      screen.getByText(
        "Faça uma pergunta ou execute uma consulta para ver o resultado aqui."
      )
    ).toBeTruthy()
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("exibe chips dos filtros informativos da análise em edição", () => {
    const filters: AnalysisFilter[] = [
      { field: "uf", operator: "=", value: "PE" },
      { field: "total", operator: ">", value: 10 },
    ]
    render(<PreviewPanel {...baseProps({ filters })} />)

    const chips = screen.getByLabelText("Filtros aplicados")
    expect(chips).toHaveTextContent("uf = PE")
    expect(chips).toHaveTextContent("total > 10")
  })

  it("área do gráfico da pré-visualização usa altura ampliada", () => {
    const { container } = render(<PreviewPanel {...baseProps()} />)

    const chartArea = container.querySelector(".h-90")
    expect(chartArea).not.toBeNull()
    expect(chartArea?.classList.contains("bg-card")).toBe(true)
  })

  it("erro mostra retry sem apagar a última visualização válida", async () => {
    const user = userEvent.setup()
    const props = baseProps({
      error: "Erro ao executar a consulta.",
      presentation: {
        ...presentationFromRows([
          { municipio: "Recife", total: 80 },
          { municipio: "Olinda", total: 40 },
        ]),
        viewMode: "table",
      },
    })
    render(<PreviewPanel {...props} />)

    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent("Erro ao executar a consulta.")
    expect(screen.getByText("Recife")).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Tentar novamente" }))
    expect(props.onRetry).toHaveBeenCalledTimes(1)
  })

  it("status de streaming aparece no cabeçalho da prévia", () => {
    render(
      <PreviewPanel
        {...baseProps({
          streaming: true,
          statusText: "Executando a consulta...",
        })}
      />
    )

    expect(screen.getByRole("status")).toHaveTextContent(
      "Executando a consulta..."
    )
  })

  it("esqueleto quando há streaming sem dados; insight só fora do chat", () => {
    const { rerender } = render(
      <PreviewPanel
        {...baseProps({
          workspace: workspaceFixture({ rows: [], rowCount: 0 }),
          streaming: true,
          statusText: "Gerando a prévia da análise...",
        })}
      />
    )
    expect(screen.queryByTestId("echart")).toBeNull()
    expect(screen.queryByText("Recife concentra o volume.")).toBeNull()

    rerender(
      <PreviewPanel {...baseProps({ streaming: true, showInsight: true })} />
    )
    expect(
      screen.getByText("Recife concentra o volume.")
    ).toBeTruthy()

    rerender(<PreviewPanel {...baseProps({ showInsight: false })} />)
    expect(
      screen.queryByText("Recife concentra o volume.")
    ).toBeNull()
  })

  it("renderiza a prévia em gráfico e expõe a edição da apresentação", () => {
    const onPresentationChange = vi.fn()
    render(
      <PreviewPanel
        {...baseProps({
          presentation: {
            chartType: "bar",
            dimension: "municipio",
            metric: "total",
            colorField: null,
            display: { ...DEFAULT_DISPLAY_OPTIONS },
            viewMode: "chart",
            filters: [],
          },
          onPresentationChange,
        })}
      />
    )

    expect(screen.getByTestId("echart")).toBeTruthy()
  })
})
