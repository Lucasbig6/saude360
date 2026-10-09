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