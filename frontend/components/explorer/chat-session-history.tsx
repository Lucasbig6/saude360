"use client"

import { ChevronDown, History, Plus, Trash2 } from "lucide-react"
import type { AISession } from "@/lib/api/ai"

interface ChatSessionHistoryProps {
  sessions: AISession[]
  activeSessionId: string | null
  loading: boolean
  disabled: boolean
  onNewSession: () => void
  onSelectSession: (session: AISession) => void
  onDeleteSession: (session: AISession) => void
}

export function ChatSessionHistory({
  sessions,
  activeSessionId,
  loading,
  disabled,
  onNewSession,
  onSelectSession,
  onDeleteSession,
}: ChatSessionHistoryProps) {
  const isDisabled = Boolean(disabled)

  return (
    <div className="ml-auto flex min-w-0 items-center gap-2">
      <button
        type="button"
        onClick={onNewSession}
        disabled={isDisabled}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus size={14} />
        Nova sessão
      </button>
      <details className="group relative min-w-0 rounded-lg border border-border bg-card">
        <summary className="flex h-9 max-w-56 cursor-pointer list-none items-center gap-1.5 px-3 text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
          <History size={13} className="shrink-0" />
          <span className="truncate">Histórico</span>
          <ChevronDown
            size={13}
            className="shrink-0 transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="absolute z-20 mt-1 max-h-72 w-72 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-lg">
          {loading ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Carregando sessões...
            </p>
          ) : sessions.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Nenhuma sessão salva para esta fonte.
            </p>
          ) : (
            sessions.map((session) => (
              <div key={session.id} className="group/session flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onSelectSession(session)}
                  disabled={isDisabled}
                  aria-current={session.id === activeSessionId || undefined}
                  className="min-w-0 flex-1 truncate rounded-md px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-current:bg-muted aria-current:text-foreground"
                >
                  {session.title || "Nova conversa"}
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteSession(session)}
                  disabled={isDisabled}
                  aria-label={`Excluir sessão: ${session.title || "Nova conversa"}`}
                  title="Excluir sessão"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </details>
    </div>
  )
}