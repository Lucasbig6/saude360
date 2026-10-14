import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  createAISession,
  listAIMessages,
  streamAIMessage,
  type AIMessage,
  type AISession,
} from "@/lib/api/ai"
import { useExplorerAgent } from "./use-explorer-agent"

vi.mock("@/lib/api/ai", () => ({
  createAISession: vi.fn(),
  listAIMessages: vi.fn(),
  streamAIMessage: vi.fn(),
}))

const dataset = { id: 7, table_name: "atendimentos" }

const session = {
  id: "session-1",
} as AISession

function aiMessage(message: Partial<AIMessage> & Pick<AIMessage, "id" | "role">): AIMessage {
  return {
    sessionId: "session-1",
    content: null,
    toolCallId: null,
    toolName: null,
    status: null,
    metadata: {},
    createdAt: "2026-10-09T00:00:00Z",
    ...message,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createAISession).mockResolvedValue(session)
  vi.mocked(streamAIMessage).mockImplementation(async (_id, _payload, handlers) => {
    handlers?.onEvent?.({
      event: "message_complete",
      data: { content: "Resposta do agente" },
    })
  })
})

describe("useExplorerAgent sessions", () => {
  it("reutiliza a sessão ativa nas próximas perguntas", async () => {
    const { result } = renderHook(() => useExplorerAgent())

    await act(async () => {
      await result.current.ask("Primeira pergunta", dataset)
      await result.current.ask("Pergunta seguinte", dataset)
    })

    expect(createAISession).toHaveBeenCalledTimes(1)
    expect(streamAIMessage).toHaveBeenNthCalledWith(
      1,
      "session-1",
      { content: "Primeira pergunta" },
      expect.any(Object)
    )
    expect(streamAIMessage).toHaveBeenNthCalledWith(
      2,
      "session-1",
      { content: "Pergunta seguinte" },
      expect.any(Object)
    )
    expect(result.current.investigations).toHaveLength(2)
  })

  it("restaura a transcrição e limpa ao iniciar nova sessão", async () => {
    vi.mocked(listAIMessages).mockResolvedValue([
      aiMessage({
        id: "message-user",
        role: "user",
        content: "Quantos atendimentos?",
      }),
      aiMessage({
        id: "message-assistant",
        role: "assistant",
        content: null,
        metadata: {
          toolCalls: [
            {
              name: "execute_query",
              arguments: { sql: "SELECT 42 AS total" },
            },
          ],
        },
      }),
      aiMessage({
        id: "message-tool",
        role: "tool",
        toolName: "execute_query",
        status: "ok",
        content: JSON.stringify({
          columns: ["total"],
          rows: [{ total: 42 }],
          rowCount: 1,
          truncated: false,
        }),
      }),
      aiMessage({
        id: "message-final",
        role: "assistant",
        content: "Foram 42 atendimentos.",
      }),
    ])
    const { result } = renderHook(() => useExplorerAgent())

    await act(async () => {
      await result.current.loadSession("session-1", dataset)
    })

    expect(result.current.activeSessionId).toBe("session-1")
    expect(result.current.investigations).toMatchObject([
      {
        question: "Quantos atendimentos?",
        insight: "Foram 42 atendimentos.",
        sql: "SELECT 42 AS total",
        queryData: {
          columns: ["total"],
          rows: [{ total: 42 }],
          rowCount: 1,
          truncated: false,
          executionMs: undefined,
        },
        sessionId: "session-1",
      },
    ])

    act(() => result.current.startNewSession())

    expect(result.current.activeSessionId).toBeNull()
    expect(result.current.investigations).toEqual([])
  })
})

describe("useExplorerAgent contrato preview_analysis", () => {
  it("aplica config e dados da prévia de forma atômica", async () => {
    vi.mocked(streamAIMessage).mockImplementation(async (_id, _payload, handlers) => {
      handlers?.onEvent?.({
        event: "tool_call",
        data: {
          toolCallId: "tc-1",
          name: "preview_analysis",
          arguments: { chartType: "bar" },
        },
      })
      handlers?.onEvent?.({
        event: "tool_result",
        data: {
          toolCallId: "tc-1",
          name: "preview_analysis",
          status: "ok",
          data: {
            config: {
              sql: "SELECT municipio, total FROM demo",
              chartType: "bar",
              dimension: "municipio",
              metric: "total",
              filters: [{ field: "uf", operator: "=", value: "PE" }],
            },
            data: {
              columns: ["municipio", "total"],
              rows: [{ municipio: "Recife", total: 80 }],
              rowCount: 1,
              truncated: false,
            },
          },
        },
      })
      handlers?.onEvent?.({
        event: "message_complete",
        data: { content: "Prévia pronta." },
      })
    })

    const { result } = renderHook(() => useExplorerAgent())

    await act(async () => {
      await result.current.ask("Compare por município", dataset)
    })

    expect(result.current.investigations).toHaveLength(1)
    const inv = result.current.investigations[0]
    expect(inv.status).toBe("done")
    expect(inv.previewConfig).toMatchObject({
      sql: "SELECT municipio, total FROM demo",
      chartType: "bar",
      dimension: "municipio",
      metric: "total",
      filters: [{ field: "uf", operator: "=", value: "PE" }],
    })
    expect(inv.sql).toBe("SELECT municipio, total FROM demo")
    expect(inv.queryData).toMatchObject({
      columns: ["municipio", "total"],
      rowCount: 1,
    })
    expect(inv.toolTrace).toEqual([
      { toolCallId: "tc-1", name: "preview_analysis", status: "ok" },
    ])
  })

  it("config inválida não derruba a prévia (sem config não aplica nada)", async () => {
    vi.mocked(streamAIMessage).mockImplementation(async (_id, _payload, handlers) => {
      handlers?.onEvent?.({
        event: "tool_call",
        data: { toolCallId: "tc-2", name: "preview_analysis", arguments: {} },
      })
      handlers?.onEvent?.({
        event: "tool_result",
        data: {
          toolCallId: "tc-2",
          name: "preview_analysis",
          status: "ok",
          data: { config: { chartType: "bar" }, data: { rows: [] } },
        },
      })
      handlers?.onEvent?.({
        event: "message_complete",
        data: { content: "Sem prévia." },
      })
    })

    const { result } = renderHook(() => useExplorerAgent())

    await act(async () => {
      await result.current.ask("Tente novamente", dataset)
    })

    const inv = result.current.investigations[0]
    expect(inv.previewConfig).toBeNull()
    expect(inv.queryData).toBeNull()
    expect(inv.sql).toBeNull()
    expect(inv.status).toBe("done")
  })

  it("restaura a prévia na transcrição da sessão", async () => {
    vi.mocked(listAIMessages).mockResolvedValue([
      aiMessage({
        id: "m-user",
        role: "user",
        content: "Compare por município",
      }),
      aiMessage({
        id: "m-assistant",
        role: "assistant",
        content: null,
        metadata: {
          toolCalls: [
            {
              name: "preview_analysis",
              arguments: { sql: "SELECT municipio, total FROM demo" },
            },
          ],
        },
      }),
      aiMessage({
        id: "m-tool",
        role: "tool",
        toolName: "preview_analysis",
        status: "ok",
        content: JSON.stringify({
          config: {
            sql: "SELECT municipio, total FROM demo",
            chartType: "line",
            dimension: "municipio",
            metric: "total",
          },
          data: {
            columns: ["municipio", "total"],
            rows: [{ municipio: "Recife", total: 80 }],
            rowCount: 1,
            truncated: false,
          },
        }),
      }),
      aiMessage({
        id: "m-final",
        role: "assistant",
        content: "Recife lidera.",
      }),
    ])

    const { result } = renderHook(() => useExplorerAgent())

    await act(async () => {
      await result.current.loadSession("session-1", dataset)
    })

    expect(result.current.investigations).toHaveLength(1)
    const inv = result.current.investigations[0]
    expect(inv.previewConfig).toMatchObject({
      chartType: "line",
      dimension: "municipio",
      metric: "total",
    })
    expect(inv.sql).toBe("SELECT municipio, total FROM demo")
    expect(inv.queryData).toMatchObject({ rowCount: 1 })
    expect(inv.insight).toBe("Recife lidera.")
  })
})