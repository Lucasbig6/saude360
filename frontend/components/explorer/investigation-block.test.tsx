import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { InvestigationBlock } from "./investigation-block"
import type { Investigation } from "@/hooks/use-explorer-agent"

function buildInvestigation(
  overrides: Partial<Investigation> = {}
): Investigation {
  return {
    id: "inv-1",
    question: "Quantos atendimentos houve?",
    datasetId: 12,
    datasetName: "demo_atendimentos",
    sessionId: "session-1",
    insight: "",
    toolTrace: [],
    currentTool: null,
    queryData: null,
    sql: null,
    savedAnalysis: null,
    status: "streaming",
    error: null,
    pendingConfirmation: null,
    ...overrides,
  }
}

function renderTurn(investigation: Investigation) {
  const callbacks = {
    onRetry: vi.fn(),
    onAbort: vi.fn(),
  }
  render(
    <InvestigationBlock
      investigation={investigation}
      onRetry={callbacks.onRetry}
      onAbort={callbacks.onAbort}
    />
  )
  return callbacks
}

describe("InvestigationBlock (turno do chat, sem gráfico)", () => {
  it("mostra Você + pergunta e o status do agente", () => {
    renderTurn(
      buildInvestigation({ currentTool: "execute_query", status: "streaming" })
    )

    expect(screen.getByText("Você")).toBeTruthy()
    expect(screen.getByText("Quantos atendimentos houve?")).toBeTruthy()
    expect(screen.getByText("Agente")).toBeTruthy()
    expect(screen.getByRole("status")).toHaveTextContent(
      "Executando a consulta..."
    )
  })

  it("exibe a pergunta real sem o contexto injetado", () => {
    renderTurn(
      buildInvestigation({
        status: "streaming",
        question:
          "Contexto da conversa:\n--- Turno 1 ---\nPergunta: antiga\n\nPergunta atual: E agora?",
      })
    )
    expect(screen.getByText("E agora?")).toBeTruthy()
    expect(screen.queryByText(/Contexto da conversa/)).toBeNull()
  })

  it("renderiza a narrativa em Markdown, sem gráfico no turno", () => {
    renderTurn(
      buildInvestigation({
        status: "done",
        insight: "Recife concentra o volume.",
        queryData: {
          columns: ["municipio", "total"],
          rows: [{ municipio: "Recife", total: 80 }],
          rowCount: 1,
          truncated: false,
          executionMs: 42,
        },
        sql: "SELECT municipio, total FROM demo",
      })
    )

    expect(screen.getByText("Recife concentra o volume.")).toBeTruthy()
    expect(screen.queryByTestId("echart")).toBeNull()
    expect(
      screen.queryByRole("button", { name: "Editar visual" })
    ).toBeNull()
  })

  it("mostra erro com tentar novamente e interromper no streaming", async () => {
    const user = userEvent.setup()
    const callbacks = renderTurn(
      buildInvestigation({ status: "streaming", error: "Falha na consulta." })
    )

    expect(screen.getByRole("alert")).toHaveTextContent("Falha na consulta.")
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }))
    expect(callbacks.onRetry).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole("button", { name: "Interromper" }))
    expect(callbacks.onAbort).toHaveBeenCalledTimes(1)
  })
})
