"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AlertCircle, Loader2, RefreshCw, Send, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  createAISession,
  listAIMessages,
  listAISessions,
  streamAIMessage,
  type AIMessage,
  type AIMessagePayload,
  type AISession,
} from "@/lib/api/ai"
import type { SSEMessage } from "@/lib/sse"
import type { Dashboard } from "@/lib/types/dashboard"
import { CopilotMarkdown } from "@/components/dashboard/copilot-markdown"

interface CopilotMessage {
  id: string
  role: "user" | "assistant"
  content: string
  status: "streaming" | "complete" | "error"
  error?: string | null
}

interface ToolStatus {
  name: string
  label: string
}

/** Tool que exige confirmação do usuário antes de executar. */
interface PendingConfirmation {
  toolCallId: string
  name: string
}

interface DashboardCopilotProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dashboard: Dashboard
  /**
   * Habilita a sessão de IA. `false` no painel público anônimo
   * (`/painel/[slug]` sem autenticação): o copiloto não é exposto ali.
   */
  enabled?: boolean
}

const SUGGESTIONS = [
  "O que chama atenção neste painel?",
  "Qual é o principal indicador?",
  "Compare os principais resultados.",
  "Existe alguma tendência nos dados?",
] as const

const ASSISTANT_PREAMBLE =
  "Posso analisar os dados, widgets e filtros deste painel. Faça uma pergunta sobre os números exibidos."

/** Rótulos amigáveis — sem expor detalhes internos das tools. */
const TOOL_LABELS: Record<string, string> = {
  get_dashboard_context: "Lendo a estrutura do painel...",
  get_dataset_schema: "Consultando os dados...",
  get_column_values: "Consultando os dados...",
  execute_query: "Consultando os dados...",
  create_analysis: "Analisando o resultado...",
  update_widget_config: "Atualizando o widget...",
}

/** Descrição amigável das ações que pedem confirmação. */
const CONFIRM_LABELS: Record<string, string> = {
  update_widget_config: "atualizar a configuração de um widget deste painel",
  create_analysis: "criar uma análise a partir dos dados consultados",
}

function confirmLabel(name: string): string {
  return CONFIRM_LABELS[name] ?? "executar uma ação neste painel"
}

const ANALYZING_LABEL = "Analisando o resultado..."

function createId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.name === "AbortError") return ""
  if (err && typeof err === "object" && "detail" in err) {
    const detail = (err as { detail?: unknown }).detail
    if (typeof detail === "string" && detail) return detail
  }
  if (err instanceof Error && err.message) return err.message
  return "Não foi possível falar com o copiloto. Tente novamente."
}

function historyToUi(rows: AIMessage[]): CopilotMessage[] {
  const messages: CopilotMessage[] = []
  for (const row of rows) {
    if (row.role === "tool") continue
    if (!row.content) continue
    messages.push({
      id: row.id,
      role: row.role === "user" ? "user" : "assistant",
      content: row.content,
      status: "complete",
    })
  }
  return messages
}

async function loadOrCreateSession(dashboardId: string): Promise<AISession> {
  const existing = await listAISessions(dashboardId)
  if (existing.length > 0) return existing[0]
  return createAISession({
    agentType: "dashboard_copilot",
    dashboardId,
    title: "Copiloto do painel",
  })
}

export function DashboardCopilot({
  open,
  onOpenChange,
  dashboard,
  enabled = true,
}: DashboardCopilotProps) {
  const [draft, setDraft] = useState("")
  const [messages, setMessages] = useState<CopilotMessage[]>([])
  const [tool, setTool] = useState<ToolStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmation | null>(null)

  const [session, setSession] = useState<AISession | null>(null)
  const sessionPromiseRef = useRef<Promise<AISession> | null>(null)
  const historyLoadedForRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Nenhum setState antes do primeiro `await`: o effect só dispara a carga.
  const bootstrap = useCallback(async () => {
    if (!sessionPromiseRef.current) {
      sessionPromiseRef.current = loadOrCreateSession(dashboard.id)
    }
    try {
      const loaded = await sessionPromiseRef.current
      setSession(loaded)
      if (historyLoadedForRef.current !== loaded.id) {
        historyLoadedForRef.current = loaded.id
        const history = await listAIMessages(loaded.id)
        setMessages(historyToUi(history))
        // Tool pendente de confirmação de um turno anterior: reexibe o cartão.
        const pendingRow = [...history]
          .reverse()
          .find((row) => row.role === "tool" && row.status === "pending_confirmation")
        setPendingConfirmation(
          pendingRow?.toolCallId
            ? { toolCallId: pendingRow.toolCallId, name: pendingRow.toolName ?? "" }
            : null
        )
      }
    } catch (err) {
      sessionPromiseRef.current = null
      setSessionError(errorMessage(err) || "Erro ao abrir a sessão do copiloto.")
    }
  }, [dashboard.id])

  useEffect(() => {
    if (!open || !enabled) return
    if (session?.dashboardId === dashboard.id) return
    void bootstrap()
  }, [open, enabled, dashboard.id, session, bootstrap])

  // Cancela o stream em andamento quando o painel fecha.
  useEffect(() => {
    if (open) return
    abortRef.current?.abort()
  }, [open])

  useEffect(() => {
    if (!open) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [open, messages, tool])

  const patchMessage = useCallback(
    (id: string, patch: (message: CopilotMessage) => CopilotMessage) => {
      setMessages((prev) => prev.map((message) => (message.id === id ? patch(message) : message)))
    },
    []
  )

  const handleEvent = useCallback(
    (assistantId: string, message: SSEMessage) => {
      const data = (message.data ?? {}) as Record<string, unknown>
      switch (message.event) {
        case "token": {
          const delta = typeof data.delta === "string" ? data.delta : ""
          if (!delta) return
          patchMessage(assistantId, (m) => ({ ...m, content: m.content + delta }))
          return
        }
        case "tool_call": {
          const name = String(data.name ?? "")
          setTool({ name, label: TOOL_LABELS[name] ?? "Consultando os dados..." })
          return
        }
        case "tool_result": {
          const name = String(data.name ?? "")
          setTool({ name, label: ANALYZING_LABEL })
          return
        }
        case "confirmation_required": {
          setTool({ name: String(data.name ?? ""), label: ANALYZING_LABEL })
          setPendingConfirmation({
            toolCallId: String(data.toolCallId ?? ""),
            name: String(data.name ?? ""),
          })
          return
        }
        case "message_complete": {
          const content = typeof data.content === "string" ? data.content : null
          if (content !== null) {
            patchMessage(assistantId, (m) => ({ ...m, content, status: "complete" }))
            return
          }
          // Turno encerrado sem texto: aguardando confirmação de tool.
          patchMessage(assistantId, (m) => ({ ...m, status: "complete" }))
          return
        }
        case "error": {
          const detail =
            typeof data.message === "string" ? data.message : "Erro ao gerar a resposta."
          setSessionError(null)
          patchMessage(assistantId, (m) => ({
            ...m,
            status: "error",
            error: detail,
            content: m.content || "",
          }))
          return
        }
      }
    },
    [patchMessage]
  )

  /** Consome o stream SSE de um turno e finaliza a mensagem do assistente. */
  const runStream = useCallback(
    async (assistantId: string, payload: AIMessagePayload) => {
      if (!session) return
      const controller = new AbortController()
      abortRef.current = controller
      try {
        await streamAIMessage(session.id, payload, {
          signal: controller.signal,
          onEvent: (message) => handleEvent(assistantId, message),
        })
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId && message.status === "streaming"
              ? { ...message, status: "complete" }
              : message
          )
        )
      } catch (err) {
        const detail = errorMessage(err)
        if (controller.signal.aborted) {
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantId && message.status === "streaming"
                ? message.content
                  ? { ...message, status: "complete" }
                  : { ...message, status: "error", error: "Resposta interrompida." }
                : message
            )
          )
        } else if (detail) {
          setSessionError(null)
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    status: "error",
                    error: detail,
                    content: message.content || "Não foi possível concluir a resposta.",
                  }
                : message
            )
          )
        }
      } finally {
        setTool(null)
        setBusy(false)
        if (abortRef.current === controller) abortRef.current = null
      }
    },
    [session, handleEvent]
  )

  const send = useCallback(
    async (raw: string) => {
      const content = raw.trim()
      if (!content || busy) return
      if (!session) {
        setSessionError("A sessão do copiloto ainda não está disponível.")
        return
      }

      setSessionError(null)
      setDraft("")
      setBusy(true)
      setTool(null)

      const assistantId = createId()
      setMessages((prev) => [
        ...prev,
        { id: createId(), role: "user", content, status: "complete" },
        { id: assistantId, role: "assistant", content: "", status: "streaming" },
      ])

      await runStream(assistantId, { content })
    },
    [busy, session, runStream]
  )

  /** Reenvia o turno com a tool pendente confirmada. */
  const confirmPending = useCallback(async () => {
    const pending = pendingConfirmation
    if (!pending?.toolCallId || busy || !session) return

    setSessionError(null)
    setPendingConfirmation(null)
    setBusy(true)
    setTool(null)

    const assistantId = createId()
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", status: "streaming" },
    ])

    await runStream(assistantId, { confirmToolCallIds: [pending.toolCallId] })
  }, [pendingConfirmation, busy, session, runStream])

  function dismissPending() {
    setPendingConfirmation(null)
  }

  function handleSuggestion(suggestion: string) {
    void send(suggestion)
  }

  function handleRetry() {
    const lastUser = [...messages].reverse().find((message) => message.role === "user")
    if (lastUser) void send(lastUser.content)
  }

  const lastUserContent = [...messages]
    .reverse()
    .find((message) => message.role === "user")?.content

  const showToolStatus = busy && tool !== null
  const loadingSession = open && enabled && !session && !sessionError

  return (
    <>
      {/* Backdrop only on small screens so desktop can keep reading the grid */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20 lg:hidden"
          onClick={() => onOpenChange(false)}
          aria-hidden="true"
        />
      )}

      <aside
        id="dashboard-copilot-panel"
        data-slot="dashboard-copilot"
        data-open={open ? "true" : "false"}
        aria-hidden={!open}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border bg-card shadow-lg transition-transform duration-200 ease-in-out sm:w-[min(100%,24rem)] lg:w-[22rem] xl:w-[24rem] min-h-screen",
          open ? "translate-x-0" : "translate-x-full",
          "pointer-events-none",
          open && "pointer-events-auto"
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5">
          <div className="flex min-w-0 items-start gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles size={15} strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground">
                Copiloto de Análise
              </h2>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {dashboard.name}
              </p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onOpenChange(false)}
            aria-label="Fechar copiloto"
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X size={16} />
          </Button>
        </div>

        {/* Conversation */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-4"
          aria-live="polite"
        >
          {loadingSession && messages.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin" />
              Preparando o copiloto deste painel...
            </div>
          ) : sessionError && messages.length === 0 ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <span>{sessionError}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  sessionPromiseRef.current = null
                  setSessionError(null)
                  void bootstrap()
                }}
                className="w-full"
              >
                <RefreshCw size={13} />
                Tentar novamente
              </Button>
            </div>
          ) : messages.length === 0 ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-primary/15 bg-primary/6 px-3.5 py-3">
                <p className="text-sm leading-relaxed text-foreground">
                  {ASSISTANT_PREAMBLE}
                </p>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Sugestões
                </p>
                <ul className="space-y-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <li key={suggestion}>
                      <button
                        type="button"
                        onClick={() => handleSuggestion(suggestion)}
                        disabled={busy || loadingSession}
                        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-left text-sm text-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {suggestion}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                As respostas usam os widgets, filtros e consultas reais deste
                painel.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessionError && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  <span>{sessionError}</span>
                </div>
              )}
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[90%] min-w-0 overflow-x-auto rounded-lg px-3 py-2 text-sm leading-relaxed",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "border border-border bg-muted/50 text-foreground"
                    )}
                  >
                    {msg.role === "assistant" && (
                      <span className="mb-1 flex items-center gap-1 text-xs font-medium text-primary">
                        <Sparkles size={11} />
                        Copiloto
                      </span>
                    )}
                    {msg.content ? (
                      msg.role === "assistant" ? (
                        <CopilotMarkdown>{msg.content}</CopilotMarkdown>
                      ) : (
                        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                      )
                    ) : msg.status === "streaming" ? (
                      <p className="flex items-center gap-1.5 text-muted-foreground">
                        <Loader2 size={12} className="animate-spin" />
                        Pensando...
                      </p>
                    ) : null}

                    {msg.status === "error" && (
                      <div className="mt-2 space-y-2">
                        <p className="flex items-start gap-1.5 text-xs text-destructive">
                          <AlertCircle size={13} className="mt-0.5 shrink-0" />
                          <span>{msg.error ?? "Erro ao gerar a resposta."}</span>
                        </p>
                        {lastUserContent && !busy && (
                          <button
                            type="button"
                            onClick={handleRetry}
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary"
                          >
                            <RefreshCw size={12} />
                            Tentar novamente
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {pendingConfirmation && !busy && (
                <div className="flex justify-start">
                  <div
                    role="alert"
                    className="max-w-[90%] rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm text-warning"
                  >
                    <p className="flex items-center gap-1.5 font-medium">
                      <AlertCircle size={14} className="shrink-0" />
                      Confirmação necessária
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-warning">
                      O copiloto quer {confirmLabel(pendingConfirmation.name)} e
                      precisa da sua autorização.
                    </p>
                    <div className="mt-2.5 flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void confirmPending()}
                        disabled={busy || !session}
                      >
                        Confirmar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={dismissPending}
                        disabled={busy}
                      >
                        Agora não
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {showToolStatus && (
                <div className="flex justify-start">
                  <div className="flex max-w-[90%] items-center gap-2 rounded-lg border border-primary/15 bg-primary/7 px-3 py-2 text-xs font-medium text-primary">
                    <Loader2 size={13} className="shrink-0 animate-spin" />
                    {tool?.label}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input */}
        <form
          className="border-t border-border px-3 py-3 sticky bottom-0 z-10"
          onSubmit={(e) => {
            e.preventDefault()
            void send(draft)
          }}
        >
          <div className="flex items-center gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Digite sua pergunta sobre o painel..."
              aria-label="Mensagem para o copiloto"
              className="h-9 bg-muted/50"
              disabled={busy || loadingSession || !session}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!draft.trim() || busy || loadingSession}
              className="shrink-0"
              aria-label="Enviar mensagem"
            >
              {busy ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Send size={15} />
              )}
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {busy
              ? "Copiloto respondendo..."
              : "Pergunte sobre os números, filtros e tendências deste painel."}
          </p>
        </form>
      </aside>
    </>
  )
}
