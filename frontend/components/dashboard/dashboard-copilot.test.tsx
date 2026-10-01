import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { DashboardCopilot } from "@/components/dashboard/dashboard-copilot"
import { CopilotMarkdown } from "@/components/dashboard/copilot-markdown"
import type { Dashboard } from "@/lib/types/dashboard"
import type { AIMessage, AISession } from "@/lib/api/ai"
import * as aiApi from "@/lib/api/ai"

vi.mock("@/lib/api/ai", () => ({
  createAISession: vi.fn(),
  listAISessions: vi.fn(),
  listAIMessages: vi.fn(),
  getAISession: vi.fn(),
  streamAIMessage: vi.fn(),
}))

const api = vi.mocked(aiApi)

const dashboard: Dashboard = {
  id: "dash-1",
  name: "Painel de Internações",
  description: "Indicadores do SUS",
  widgets: [],
  filters: [],
  projectId: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
}

const session: AISession = {
  id: "sess-1",
  agentType: "dashboard_copilot",
  dashboardId: "dash-1",
  datasetId: null,
  title: "Copiloto do painel",
  provider: "fake",
  model: "fake-model",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
}

function history(): AIMessage[] {
  return [
    {
      id: "m1",
      sessionId: "sess-1",
      role: "user",
      content: "Bom dia",
      toolCallId: null,
      toolName: null,
      status: "complete",
      metadata: {},
      createdAt: "2026-01-01T00:00:00Z",
    },
    {
      id: "m2",
      sessionId: "sess-1",
      role: "assistant",
      content: "Olá! Vamos ao painel.",
      toolCallId: null,
      toolName: null,
      status: "complete",
      metadata: {},
      createdAt: "2026-01-01T00:00:01Z",
    },
    {
      id: "m3",
      sessionId: "sess-1",
      role: "tool",
      content: "{}",
      toolCallId: "call_1",
      toolName: "execute_query",
      status: "ok",
      metadata: {},
      createdAt: "2026-01-01T00:00:01Z",
    },
  ]
}

function renderCopilot(props: Partial<Parameters<typeof DashboardCopilot>[0]> = {}) {
  return render(
    <DashboardCopilot
      open
      onOpenChange={() => undefined}
      dashboard={dashboard}
      {...props}
    />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("abertura do copiloto", () => {
  it("retoma a sessão existente e carrega o histórico", async () => {
    api.listAISessions.mockResolvedValue([session])
    api.listAIMessages.mockResolvedValue(history())

    renderCopilot()

    expect(await screen.findByText("Bom dia")).toBeInTheDocument()
    expect(await screen.findByText("Olá! Vamos ao painel.")).toBeInTheDocument()

    expect(api.listAISessions).toHaveBeenCalledWith("dash-1")
    expect(api.createAISession).not.toHaveBeenCalled()
    expect(api.listAIMessages).toHaveBeenCalledWith("sess-1")
    // mensagens de tool não são exibidas cruas
    expect(screen.queryByText("{}")).not.toBeInTheDocument()
  })

  it("cria a sessão quando não existe conversa anterior", async () => {
    api.listAISessions.mockResolvedValue([])
    api.createAISession.mockResolvedValue(session)
    api.listAIMessages.mockResolvedValue([])

    renderCopilot()

    expect(await screen.findByText("Sugestões")).toBeInTheDocument()
    expect(api.createAISession).toHaveBeenCalledWith({
      agentType: "dashboard_copilot",
      dashboardId: "dash-1",
      title: "Copiloto do painel",
    })
  })

  it("não fala com a API quando desabilitado (painel público anônimo)", async () => {
    renderCopilot({ enabled: false })

    await waitFor(() => expect(api.listAISessions).not.toHaveBeenCalled())
    expect(screen.queryByLabelText("Mensagem para o copiloto")).toBeInTheDocument()
  })

  it("mostra erro e opção de tentar novamente quando a sessão falha", async () => {
    api.listAISessions.mockRejectedValue({ detail: "Dashboard não encontrado" })

    renderCopilot()

    expect(await screen.findByText("Dashboard não encontrado")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Tentar novamente/ })).toBeInTheDocument()
    expect(api.createAISession).not.toHaveBeenCalled()
  })
})

describe("envio de mensagens", () => {
  it("envia, mostra tool call, renderiza tokens e conclui a resposta", async () => {
    api.listAISessions.mockResolvedValue([session])
    api.listAIMessages.mockResolvedValue([])

    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    api.streamAIMessage.mockImplementation(async (_id, _payload, handlers) => {
      const onEvent = handlers?.onEvent
      onEvent?.({ event: "message_start", data: {} })
      onEvent?.({
        event: "tool_call",
        data: { toolCallId: "call_q", name: "execute_query", arguments: {} },
      })
      await gate
      onEvent?.({
        event: "tool_result",
        data: { toolCallId: "call_q", name: "execute_query", status: "ok" },
      })
      onEvent?.({ event: "token", data: { delta: "As internações " } })
      onEvent?.({ event: "token", data: { delta: "subiram 18%." } })
      onEvent?.({
        event: "message_complete",
        data: { content: "As internações subiram 18%." },
      })
    })

    renderCopilot()
    const input = await screen.findByLabelText("Mensagem para o copiloto")

    await userEvent.type(input, "Por que as internações aumentaram em maio?")
    await userEvent.click(screen.getByLabelText("Enviar mensagem"))

    // pergunta do usuário aparece
    expect(
      await screen.findByText("Por que as internações aumentaram em maio?")
    ).toBeInTheDocument()

    // estado amigável da tool call (sem detalhes internos)
    expect(await screen.findByText("Consultando os dados...")).toBeInTheDocument()

    release?.()

    // tokens montam a resposta final
    expect(await screen.findByText("As internações subiram 18%.")).toBeInTheDocument()

    expect(api.streamAIMessage).toHaveBeenCalledWith(
      "sess-1",
      { content: "Por que as internações aumentaram em maio?" },
      expect.objectContaining({ onEvent: expect.any(Function) })
    )

    // turno encerrado: entrada liberada para a próxima pergunta
    await waitFor(() => expect(input).toBeEnabled())
    expect(screen.queryByText("Consultando os dados...")).not.toBeInTheDocument()
  })

  it("mostra 'Analisando o resultado...' após o tool_result", async () => {
    api.listAISessions.mockResolvedValue([session])
    api.listAIMessages.mockResolvedValue([])

    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    api.streamAIMessage.mockImplementation(async (_id, _payload, handlers) => {
      const onEvent = handlers?.onEvent
      onEvent?.({ event: "message_start", data: {} })
      onEvent?.({
        event: "tool_call",
        data: { toolCallId: "call_c", name: "get_dashboard_context" },
      })
      onEvent?.({
        event: "tool_result",
        data: { toolCallId: "call_c", name: "get_dashboard_context", status: "ok" },
      })
      await gate
      onEvent?.({ event: "message_complete", data: { content: "Pronto." } })
    })

    renderCopilot()
    const input = await screen.findByLabelText("Mensagem para o copiloto")
    await userEvent.type(input, "Resuma o painel")
    await userEvent.click(screen.getByLabelText("Enviar mensagem"))

    expect(await screen.findByText("Analisando o resultado...")).toBeInTheDocument()
    release?.()
    expect(await screen.findByText("Pronto.")).toBeInTheDocument()
  })
})

describe("erros do stream", () => {
  it("exibe o evento error e permite nova pergunta", async () => {
    api.listAISessions.mockResolvedValue([session])
    api.listAIMessages.mockResolvedValue([])
    api.streamAIMessage.mockImplementation(async (_id, _payload, handlers) => {
      handlers?.onEvent?.({ event: "message_start", data: {} })
      handlers?.onEvent?.({
        event: "error",
        data: { code: "provider_error", message: "Erro ao gerar a resposta." },
      })
    })

    renderCopilot()
    const input = await screen.findByLabelText("Mensagem para o copiloto")
    await userEvent.type(input, "olá")
    await userEvent.click(screen.getByLabelText("Enviar mensagem"))

    expect(await screen.findByText("Erro ao gerar a resposta.")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /Tentar novamente/ })
    ).toBeInTheDocument()
    await waitFor(() => expect(input).toBeEnabled())
  })

  it("trata falha de requisição com o detalhe da API", async () => {
    api.listAISessions.mockResolvedValue([session])
    api.listAIMessages.mockResolvedValue([])
    api.streamAIMessage.mockRejectedValue({
      detail: "Sessão de IA não encontrada",
    })

    renderCopilot()
    const input = await screen.findByLabelText("Mensagem para o copiloto")
    await userEvent.type(input, "olá")
    await userEvent.click(screen.getByLabelText("Enviar mensagem"))

    expect(
      await screen.findByText("Sessão de IA não encontrada")
    ).toBeInTheDocument()
    await waitFor(() => expect(input).toBeEnabled())
  })
})

const GFM_TABLE = `**O que chama atenção no painel**

| Item | Observação | Fonte | Interpretação |
|------|------------|-------|---------------|
| **Só há um widget** | O painel contém apenas um widget | \`get_dashboard_context\` | O foco analítico é único. |
| **Amostra limitada** | O resultado mostra 5 linhas | \`execute_query\` | O conjunto pode estar incompleto. |

**Resumo**

O painel apresenta uma amostra limitada dos dados.`

describe("renderização markdown", () => {
  it("renderiza negrito", () => {
    const { container } = render(<CopilotMarkdown>**Atenção**</CopilotMarkdown>)
    const strong = container.querySelector("strong")
    expect(strong).not.toBeNull()
    expect(strong).toHaveTextContent("Atenção")
  })

  it("renderiza lista", () => {
    const { container } = render(
      <CopilotMarkdown>{"- item um\n- item dois"}</CopilotMarkdown>
    )
    expect(container.querySelectorAll("ul")).toHaveLength(1)
    expect(container.querySelectorAll("ul li")).toHaveLength(2)
    expect(container).toHaveTextContent("item um")
    expect(container).toHaveTextContent("item dois")
  })

  it("renderiza tabela GFM como tabela HTML", () => {
    const { container } = render(<CopilotMarkdown>{GFM_TABLE}</CopilotMarkdown>)
    expect(container.querySelector("table")).not.toBeNull()
    expect(container.querySelector("thead")).not.toBeNull()
    expect(container.querySelector("tbody")).not.toBeNull()
    expect(container.querySelectorAll("thead th")).toHaveLength(4)
    expect(container.querySelectorAll("tbody tr")).toHaveLength(2)
    // cabeçalho e células com conteúdo
    expect(container.querySelector("table")).toHaveTextContent("Observação")
    expect(container.querySelector("table")).toHaveTextContent(
      "O foco analítico é único."
    )
    // não exibe a tabela como texto contendo pipes
    expect(container.textContent).not.toContain("| Item | Observação |")
  })

  it("renderiza código inline e bloco de código", () => {
    const { container } = render(
      <CopilotMarkdown>
        {"Use `execute_query`:\n\n```sql\nSELECT * FROM tabela;\n```"}
      </CopilotMarkdown>
    )
    expect(container.querySelector("p code")).toHaveTextContent("execute_query")
    const pre = container.querySelector("pre")
    expect(pre).not.toBeNull()
    expect(pre?.querySelector("code")).toHaveTextContent("SELECT * FROM tabela;")
  })

  it("continua renderizando texto simples", () => {
    render(<CopilotMarkdown>{"As internações subiram 18%."}</CopilotMarkdown>)
    expect(
      screen.getByText("As internações subiram 18%.")
    ).toBeInTheDocument()
  })

  it("não executa HTML vindo do modelo", () => {
    const { container } = render(
      <CopilotMarkdown>
        {'<img src=x onerror="window.__mdPwned=1">\n\n<script>window.__mdPwned=2</script>'}
      </CopilotMarkdown>
    )
    expect(
      container.querySelector("img, script, iframe, object, embed, style")
    ).toBeNull()
    expect(
      (window as unknown as Record<string, unknown>).__mdPwned
    ).toBeUndefined()
  })

  it("renderiza o Markdown progressivamente durante o streaming", async () => {
    api.listAISessions.mockResolvedValue([session])
    api.listAIMessages.mockResolvedValue([])

    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    api.streamAIMessage.mockImplementation(async (_id, _payload, handlers) => {
      const onEvent = handlers?.onEvent
      onEvent?.({ event: "message_start", data: {} })
      onEvent?.({ event: "token", data: { delta: "**Resumo** do painel" } })
      await gate
      onEvent?.({ event: "token", data: { delta: ":\n\n- ponto um" } })
      onEvent?.({
        event: "message_complete",
        data: { content: "**Resumo** do painel:\n\n- ponto um" },
      })
    })

    const view = renderCopilot()
    const input = await screen.findByLabelText("Mensagem para o copiloto")
    await userEvent.type(input, "Resuma o painel")
    await userEvent.click(screen.getByLabelText("Enviar mensagem"))

    // tokens parciais já formatados ANTES do message_complete
    expect(await screen.findByText("Resumo")).toBeInTheDocument()
    expect(view.container.querySelector("strong")).not.toBeNull()
    expect(view.container.querySelector("ul")).toBeNull()

    release?.()

    // markdown finalizado: lista completa
    expect(await screen.findByText("ponto um")).toBeInTheDocument()
    expect(view.container.querySelectorAll("ul li")).toHaveLength(1)
    await waitFor(() => expect(input).toBeEnabled())
  })
})

function pendingConfirmationStream(
  _id: string,
  payload: { content?: string; confirmToolCallIds?: string[] },
  handlers?: { onEvent?: (m: { event: string; data: Record<string, unknown> }) => void }
) {
  const onEvent = handlers?.onEvent
  onEvent?.({ event: "message_start", data: {} })
  if (payload.confirmToolCallIds?.length) {
    onEvent?.({ event: "token", data: { delta: "Widget atualizado com sucesso." } })
    onEvent?.({
      event: "message_complete",
      data: { content: "Widget atualizado com sucesso." },
    })
    return Promise.resolve()
  }
  onEvent?.({
    event: "tool_call",
    data: { toolCallId: "call_p1", name: "update_widget_config", arguments: {} },
  })
  onEvent?.({
    event: "tool_result",
    data: {
      toolCallId: "call_p1",
      name: "update_widget_config",
      status: "pending_confirmation",
    },
  })
  onEvent?.({
    event: "confirmation_required",
    data: { toolCallId: "call_p1", name: "update_widget_config", arguments: {} },
  })
  onEvent?.({
    event: "message_complete",
    data: { content: null, pendingConfirmation: true },
  })
  return Promise.resolve()
}

describe("confirmação de ações", () => {
  it("mostra o cartão de confirmação e envia confirmToolCallIds ao aprovar", async () => {
    api.listAISessions.mockResolvedValue([session])
    api.listAIMessages.mockResolvedValue([])
    api.streamAIMessage.mockImplementation(
      pendingConfirmationStream as unknown as typeof aiApi.streamAIMessage
    )

    renderCopilot()
    const input = await screen.findByLabelText("Mensagem para o copiloto")
    await userEvent.type(input, "Atualize o widget de internações")
    await userEvent.click(screen.getByLabelText("Enviar mensagem"))

    // turno termina aguardando confirmação (sem spinner travado)
    expect(
      await screen.findByText("Confirmação necessária")
    ).toBeInTheDocument()
    expect(screen.queryByText("Pensando...")).not.toBeInTheDocument()
    await waitFor(() => expect(input).toBeEnabled())

    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }))

    expect(await screen.findByText("Widget atualizado com sucesso.")).toBeInTheDocument()
    expect(api.streamAIMessage).toHaveBeenNthCalledWith(
      2,
      "sess-1",
      { confirmToolCallIds: ["call_p1"] },
      expect.objectContaining({ onEvent: expect.any(Function) })
    )
    expect(
      screen.queryByText("Confirmação necessária")
    ).not.toBeInTheDocument()
  })

  it("dispensa a confirmação sem reenviar o turno", async () => {
    api.listAISessions.mockResolvedValue([session])
    api.listAIMessages.mockResolvedValue([])
    api.streamAIMessage.mockImplementation(
      pendingConfirmationStream as unknown as typeof aiApi.streamAIMessage
    )

    renderCopilot()
    const input = await screen.findByLabelText("Mensagem para o copiloto")
    await userEvent.type(input, "Mude o tipo do gráfico")
    await userEvent.click(screen.getByLabelText("Enviar mensagem"))

    expect(
      await screen.findByText("Confirmação necessária")
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Agora não" }))

    expect(
      screen.queryByText("Confirmação necessária")
    ).not.toBeInTheDocument()
    expect(api.streamAIMessage).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(input).toBeEnabled())
  })

  it("reexibe a confirmação pendente ao recarregar o histórico", async () => {
    api.listAISessions.mockResolvedValue([session])
    api.listAIMessages.mockResolvedValue([
      ...history(),
      {
        id: "m4",
        sessionId: "sess-1",
        role: "tool",
        content: '{"message":"aguarda confirmação"}',
        toolCallId: "call_h1",
        toolName: "update_widget_config",
        status: "pending_confirmation",
        metadata: {},
        createdAt: "2026-01-01T00:00:02Z",
      },
    ])

    renderCopilot()

    expect(
      await screen.findByText("Confirmação necessária")
    ).toBeInTheDocument()
    expect(api.streamAIMessage).not.toHaveBeenCalled()
  })
})
