import { act, render, screen } from "@testing-library/react"
import { hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { AgentInput } from "./exploration-input"

vi.mock("./sql-editor", () => ({ SqlEditor: () => null }))
vi.mock("./visualization-panel", () => ({ VisualizationPanel: () => null }))

function renderAgentInput(overrides: Partial<Parameters<typeof AgentInput>[0]> = {}) {
  return (
    <AgentInput
      value="Quantos atendimentos?"
      onChange={vi.fn()}
      onAsk={vi.fn()}
      onAskSql={vi.fn()}
      disabled={false}
      busy={false}
      hasDataset
      columns={[]}
      {...overrides}
    />
  )
}

describe("AgentInput hydration", () => {
  it("renderiza o botão Investigar desabilitado no HTML do servidor", () => {
    const markup = renderToString(renderAgentInput())
    const button = markup.match(/<button[^>]*aria-label="Investigar"[^>]*>/)

    expect(button?.[0]).toContain("disabled")
  })

  it("habilita o botão no cliente quando a pergunta tem fonte válida", () => {
    render(renderAgentInput())

    expect(screen.getByRole("button", { name: "Investigar" })).toBeEnabled()
  })

  it("hidrata sem divergência no estado disabled do botão", async () => {
    const container = document.createElement("div")
    container.innerHTML = renderToString(renderAgentInput())
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    const root = hydrateRoot(container, renderAgentInput())

    await act(async () => {})

    expect(consoleError).not.toHaveBeenCalled()
    await act(async () => root.unmount())
    consoleError.mockRestore()
  })
})