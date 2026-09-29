import { apiGet, apiPost, apiStream } from "../api"
import { readSSE, type SSEMessage } from "../sse"

export type AIAgentType = "dashboard_copilot" | "explorer"

export interface AISession {
  id: string
  agentType: AIAgentType
  dashboardId: string | null
  datasetId: number | null
  title: string | null
  provider: string | null
  model: string | null
  createdAt: string
  updatedAt: string
}

export interface AIMessage {
  id: string
  sessionId: string
  role: "user" | "assistant" | "tool"
  content: string | null
  toolCallId: string | null
  toolName: string | null
  status: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

export interface AIMessagePayload {
  content?: string
  confirmToolCallIds?: string[]
}

export interface StreamHandlers {
  signal?: AbortSignal
  onEvent?: (message: SSEMessage) => void
}

/** Sessão do copiloto ancorada num dashboard do usuário autenticado. */
export function createAISession(payload: {
  agentType: AIAgentType
  dashboardId?: string
  datasetId?: number
  title?: string
}): Promise<AISession> {
  return apiPost<AISession>("/api/ai/sessions", payload)
}

/** Sessões próprias de um dashboard (mais recentes primeiro). */
export function listAISessions(dashboardId: string): Promise<AISession[]> {
  return apiGet<AISession[]>(
    `/api/ai/sessions?dashboardId=${encodeURIComponent(dashboardId)}`
  )
}

export function getAISession(sessionId: string): Promise<AISession> {
  return apiGet<AISession>(`/api/ai/sessions/${sessionId}`)
}

export function listAIMessages(sessionId: string): Promise<AIMessage[]> {
  return apiGet<AIMessage[]>(`/api/ai/sessions/${sessionId}/messages`)
}

/**
 * Envia uma mensagem e consome o stream SSE da resposta.
 *
 * Eventos: `message_start`, `token`, `tool_call`, `tool_result`,
 * `confirmation_required`, `message_complete`, `error`.
 */
export async function streamAIMessage(
  sessionId: string,
  payload: AIMessagePayload,
  handlers: StreamHandlers = {}
): Promise<void> {
  const response = await apiStream(`/api/ai/sessions/${sessionId}/messages`, payload, {
    signal: handlers.signal,
  })
  for await (const message of readSSE(response)) {
    handlers.onEvent?.(message)
  }
}
