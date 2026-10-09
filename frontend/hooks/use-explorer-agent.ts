"use client"

import { useCallback, useRef, useState } from "react"
import {
  createAISession,
  listAIMessages,
  streamAIMessage,
  type AIMessagePayload,
} from "@/lib/api/ai"
import { ApiError } from "@/lib/api"
import type { SSEMessage } from "@/lib/sse"

export type InvestigationStatus =
  | "streaming"
  | "awaiting_confirmation"
  | "done"
  | "error"

export interface ToolTraceEntry {
  toolCallId: string
  name: string
  status: "running" | "ok" | "error" | "denied" | "pending_confirmation"
}

export interface ExplorerQueryData {
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  truncated: boolean
  executionMs?: number
}

export interface PendingConfirmation {
  toolCallId: string
  name: string
}

export interface SavedAgentAnalysis {
  analysisId: string
  name: string
}

export interface Investigation {
  id: string
  question: string
  datasetId: number
  datasetName: string
  sessionId: string | null
  insight: string
  toolTrace: ToolTraceEntry[]
  currentTool: string | null
  queryData: ExplorerQueryData | null
  sql: string | null
  /** Preenchido quando `create_analysis` é confirmada e executada. */
  savedAnalysis: SavedAgentAnalysis | null
  status: InvestigationStatus
  error: string | null
  pendingConfirmation: PendingConfirmation | null
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `inv-${Date.now()}-${Math.floor(Math.random() * 1e9)}`
}

function errorMessage(err: unknown): string | null {
  if (err instanceof ApiError) return err.detail
  if (err instanceof Error) return err.message || null
  return null
}

function asRecord(value: unknown): Record<string, unknown> {
  return (value ?? {}) as Record<string, unknown>
}

function normalizeQueryData(data: unknown): ExplorerQueryData | null {
  const record = asRecord(data)
  const rawColumns = Array.isArray(record.columns)
    ? record.columns.filter((c): c is string => typeof c === "string")
    : []
  const rawRows = Array.isArray(record.rows) ? record.rows : []
  const rows = rawRows.filter(
    (row): row is Record<string, unknown> =>
      typeof row === "object" && row !== null
  )
  if (rawColumns.length === 0 && rows.length === 0) return null
  const columns =
    rawColumns.length > 0
      ? rawColumns
      : Object.keys(rows[0] ?? {})
  return {
    columns,
    rows,
    rowCount:
      typeof record.rowCount === "number" ? record.rowCount : rows.length,
    truncated: record.truncated === true,
    executionMs:
      typeof record.executionMs === "number" ? record.executionMs : undefined,
  }
}

/**
 * Agente IA do Explorar — 1 sessão de backend (`explorer` + `datasetId`)
 * por pergunta, com thread visual contínua na página.
 *
 * Reutiliza o contrato SSE existente (`message_start/token/tool_call/
 * tool_result/confirmation_required/message_complete/error`).
 */
export function useExplorerAgent() {
  const [investigations, setInvestigations] = useState<Investigation[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const latestRef = useRef<Investigation[]>([])
  const activeSessionRef = useRef<string | null>(null)
  const sessionLoadRef = useRef(0)
  const abortRefs = useRef(new Map<string, AbortController>())
  // toolCallId -> argumentos (para recuperar o SQL do execute_query,
  // que o tool_result não devolve).
  const argsRefs = useRef(new Map<string, Record<string, unknown>>())

  const patch = useCallback(
    (id: string, fn: (inv: Investigation) => Investigation) => {
      setInvestigations((prev) => {
        const next = prev.map((inv) => (inv.id === id ? fn(inv) : inv))
        latestRef.current = next
        return next
      })
    },
    []
  )

  const replace = useCallback((id: string, inv: Investigation) => {
    setInvestigations((prev) => {
      const next = prev.map((item) => (item.id === id ? inv : item))
      latestRef.current = next
      return next
    })
  }, [])

  const handleEvent = useCallback(
    (id: string, message: SSEMessage) => {
      const data = asRecord(message.data)
      switch (message.event) {
        case "token": {
          const delta = typeof data.delta === "string" ? data.delta : ""
          if (!delta) return
          patch(id, (inv) => ({ ...inv, insight: inv.insight + delta }))
          return
        }
        case "tool_call": {
          const toolCallId = String(data.toolCallId ?? "")
          const name = String(data.name ?? "")
          if (data.arguments && typeof data.arguments === "object") {
            argsRefs.current.set(
              toolCallId,
              data.arguments as Record<string, unknown>
            )
          }
          patch(id, (inv) => ({
            ...inv,
            currentTool: name || null,
            toolTrace: toolCallId
              ? [
                  ...inv.toolTrace.filter((t) => t.toolCallId !== toolCallId),
                  { toolCallId, name, status: "running" as const },
                ]
              : inv.toolTrace,
          }))
          return
        }
        case "tool_result": {
          const toolCallId = String(data.toolCallId ?? "")
          const name = String(data.name ?? "")
          const status = String(data.status ?? "ok")
          patch(id, (inv) => {
            const toolTrace = inv.toolTrace.map((t) =>
              t.toolCallId === toolCallId
                ? {
                    ...t,
                    status:
                      status === "ok"
                        ? ("ok" as const)
                        : status === "pending_confirmation"
                          ? ("pending_confirmation" as const)
                          : status === "denied"
                            ? ("denied" as const)
                            : ("error" as const),
                  }
                : t
            )
            let queryData = inv.queryData
            let sql = inv.sql
            let savedAnalysis = inv.savedAnalysis
            if (name === "execute_query" && status === "ok") {
              const normalized = normalizeQueryData(data.data)
              if (normalized) queryData = normalized
              const args = argsRefs.current.get(toolCallId)
              const candidate = args?.sql
              if (typeof candidate === "string" && candidate.trim()) {
                sql = candidate
              }
            }
            if (name === "create_analysis" && status === "ok") {
              const result = asRecord(data.data)
              const analysisId =
                typeof result.analysisId === "string" ? result.analysisId : null
              const savedName =
                typeof result.name === "string" ? result.name : null
              if (analysisId) {
                savedAnalysis = { analysisId, name: savedName ?? "Análise" }
              }
            }
            return {
              ...inv,
              toolTrace,
              currentTool: null,
              queryData,
              sql,
              savedAnalysis,
            }
          })
          return
        }
        case "confirmation_required": {
          const toolCallId = String(data.toolCallId ?? "")
          const name = String(data.name ?? "")
          patch(id, (inv) => ({
            ...inv,
            currentTool: null,
            status: "awaiting_confirmation",
            pendingConfirmation: toolCallId ? { toolCallId, name } : inv.pendingConfirmation,
            toolTrace: inv.toolTrace.map((t) =>
              t.toolCallId === toolCallId
                ? { ...t, status: "pending_confirmation" as const }
                : t
            ),
          }))
          return
        }
        case "message_complete": {
          const content = typeof data.content === "string" ? data.content : null
          patch(id, (inv) => ({
            ...inv,
            insight: content ?? inv.insight,
            status: inv.pendingConfirmation
              ? "awaiting_confirmation"
              : "done",
            currentTool: null,
          }))
          return
        }
        case "error": {
          const detail =
            typeof data.message === "string"
              ? data.message
              : "Erro ao gerar a resposta."
          patch(id, (inv) => ({
            ...inv,
            status: "error",
            error: detail,
            currentTool: null,
          }))
          return
        }
      }
    },
    [patch]
  )

  const runStream = useCallback(
    async (inv: Investigation, payload: AIMessagePayload) => {
      const sessionId = inv.sessionId
      if (!sessionId) {
        patch(inv.id, (prev) => ({
          ...prev,
          status: "error",
          error: "Sessão do agente indisponível.",
        }))
        return
      }
      const controller = new AbortController()
      abortRefs.current.set(inv.id, controller)
      try {
        await streamAIMessage(sessionId, payload, {
          signal: controller.signal,
          onEvent: (message) => handleEvent(inv.id, message),
        })
        patch(inv.id, (prev) =>
          prev.status === "streaming"
            ? { ...prev, status: "done", currentTool: null }
            : prev
        )
      } catch (err) {
        if (controller.signal.aborted) {
          patch(inv.id, (prev) =>
            prev.insight || prev.queryData
              ? { ...prev, status: "done", currentTool: null }
              : {
                  ...prev,
                  status: "error",
                  error: "Resposta interrompida.",
                  currentTool: null,
                }
          )
        } else {
          const detail = errorMessage(err) ?? "Não foi possível concluir a resposta."
          patch(inv.id, (prev) => ({
            ...prev,
            status: "error",
            error: detail,
            currentTool: null,
          }))
        }
      } finally {
        if (abortRefs.current.get(inv.id) === controller) {
          abortRefs.current.delete(inv.id)
        }
      }
    },
    [handleEvent, patch]
  )

  /** Nova pergunta cria uma sessão quando necessário e depois reutiliza-a. */
  const ask = useCallback(
    async (question: string, dataset: { id: number; table_name: string }) => {
      const text = question.trim()
      if (!text) return null
      const id = createId()
      const inv: Investigation = {
        id,
        question: text,
        datasetId: dataset.id,
        datasetName: dataset.table_name,
        sessionId: null,
        insight: "",
        toolTrace: [],
        currentTool: null,
        queryData: null,
        sql: null,
        savedAnalysis: null,
        status: "streaming",
        error: null,
        pendingConfirmation: null,
      }
      setInvestigations((prev) => {
        latestRef.current = [...prev, inv]
        return [...prev, inv]
      })
      try {
        let sessionId = activeSessionRef.current
        if (!sessionId) {
          const session = await createAISession({
            agentType: "explorer",
            datasetId: dataset.id,
            title: text.slice(0, 60),
          })
          sessionId = session.id
          activeSessionRef.current = sessionId
          setActiveSessionId(sessionId)
        }
        const withSession: Investigation = {
          ...inv,
          sessionId,
        }
        replace(id, withSession)
        await runStream(withSession, { content: text })
      } catch (err) {
        const detail =
          errorMessage(err) ?? "Não foi possível iniciar a investigação."
        patch(id, (prev) => ({ ...prev, status: "error", error: detail }))
      }
      return id
    },
    [patch, replace, runStream]
  )

  const startNewSession = useCallback(() => {
    sessionLoadRef.current += 1
    for (const controller of abortRefs.current.values()) controller.abort()
    abortRefs.current.clear()
    activeSessionRef.current = null
    setActiveSessionId(null)
    latestRef.current = []
    setInvestigations([])
  }, [])

  const loadSession = useCallback(
    async (
      sessionId: string,
      dataset: { id: number; table_name: string }
    ) => {
      const loadId = ++sessionLoadRef.current
      for (const controller of abortRefs.current.values()) controller.abort()
      abortRefs.current.clear()
      activeSessionRef.current = sessionId
      setActiveSessionId(sessionId)
      latestRef.current = []
      setInvestigations([])

      const messages = await listAIMessages(sessionId)
      if (sessionLoadRef.current !== loadId) return

      const restored: Investigation[] = []
      for (const message of messages) {
        if (message.role === "user") {
          restored.push({
            id: message.id,
            question: message.content ?? "",
            datasetId: dataset.id,
            datasetName: dataset.table_name,
            sessionId,
            insight: "",
            toolTrace: [],
            currentTool: null,
            queryData: null,
            sql: null,
            savedAnalysis: null,
            status: "done",
            error: null,
            pendingConfirmation: null,
          })
        } else if (message.role === "assistant") {
          const latest = restored[restored.length - 1]
          if (latest && message.content) latest.insight += message.content
          const toolCalls = asRecord(message.metadata).toolCalls
          if (latest && Array.isArray(toolCalls)) {
            const queryCall = toolCalls.find(
              (call) =>
                typeof call === "object" &&
                call !== null &&
                asRecord(call).name === "execute_query"
            )
            const args = queryCall ? asRecord(asRecord(queryCall).arguments) : {}
            if (typeof args.sql === "string") latest.sql = args.sql
          }
        } else if (message.role === "tool" && message.toolName === "execute_query") {
          const latest = restored[restored.length - 1]
          if (latest && message.status === "ok" && message.content) {
            try {
              latest.queryData = normalizeQueryData(JSON.parse(message.content))
            } catch {
              latest.queryData = null
            }
          }
        }
      }

      latestRef.current = restored
      setInvestigations(restored)
    },
    []
  )

  const retry = useCallback(
    async (id: string) => {
      const current = latestRef.current.find((item) => item.id === id)
      if (!current?.sessionId) return
      const reset: Investigation = {
        ...current,
        insight: "",
        toolTrace: [],
        currentTool: null,
        queryData: null,
        sql: null,
        savedAnalysis: null,
        status: "streaming",
        error: null,
        pendingConfirmation: null,
      }
      replace(id, reset)
      await runStream(reset, { content: reset.question })
    },
    [replace, runStream]
  )

  const confirmPending = useCallback(
    async (id: string) => {
      const current = latestRef.current.find((item) => item.id === id)
      const toolCallId = current?.pendingConfirmation?.toolCallId
      if (!toolCallId || !current?.sessionId) return
      patch(id, (prev) => ({
        ...prev,
        status: "streaming",
        error: null,
      }))
      await runStream(current, { confirmToolCallIds: [toolCallId] })
      patch(id, (prev) => ({ ...prev, pendingConfirmation: null }))
    },
    [patch, runStream]
  )

  const dismissPending = useCallback(
    (id: string) => {
      patch(id, (prev) => ({
        ...prev,
        pendingConfirmation: null,
        status: prev.status === "awaiting_confirmation" ? "done" : prev.status,
        toolTrace: prev.toolTrace.map((t) =>
          t.status === "pending_confirmation" ? { ...t, status: "ok" as const } : t
        ),
      }))
    },
    [patch]
  )

  const abort = useCallback((id: string) => {
    abortRefs.current.get(id)?.abort()
  }, [])

  const abortAll = useCallback(() => {
    for (const controller of abortRefs.current.values()) {
      controller.abort()
    }
  }, [])

  return {
    investigations,
    activeSessionId,
    ask,
    startNewSession,
    loadSession,
    retry,
    confirmPending,
    dismissPending,
    abort,
    abortAll,
  }
}
