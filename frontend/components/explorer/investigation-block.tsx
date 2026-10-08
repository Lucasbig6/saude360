"use client"

import { Loader2, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Investigation } from "@/hooks/use-explorer-agent"
import { CopilotMarkdown } from "@/components/dashboard/copilot-markdown"
import { displayQuestion } from "@/lib/explorer/chat-context"

interface InvestigationBlockProps {
  investigation: Investigation
  onRetry: () => void
  onAbort: () => void
}

const TOOL_STATUS_TEXT: Record<string, string> = {
  get_dataset_schema: "Lendo o schema...",
  get_column_values: "Buscando valores...",
  execute_query: "Executando a consulta...",
  create_analysis: "Salvando a análise...",
}

const TRACE_LABELS: Record<string, string> = {
  get_dataset_schema: "Schema",
  get_column_values: "Valores",
  execute_query: "Consulta",
  create_analysis: "Salvamento",
}

/**
 * Turno da conversa com os dados: mensagem do usuário (discreta, à direita)
 * + resposta do agente (rótulo institucional + narrativa em Markdown).
 *
 * O resultado analítico (gráfico/tabela/insights/ações) vive no painel
 * Resultado, fora das mensagens — a conversa é a narrativa, o painel é a
 * evidência.
 */
export function InvestigationBlock({
  investigation,
  onRetry,
  onAbort,
}: InvestigationBlockProps) {
  const streaming = investigation.status === "streaming"
  const statusText = streaming
    ? investigation.currentTool
      ? (TOOL_STATUS_TEXT[investigation.currentTool] ??
        "Consultando os dados...")
      : "Analisando..."
    : null

  return (
    <article
      data-testid={`investigation-${investigation.id}`}
      className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 py-5 sm:px-8"
    >
      {/* Mensagem do usuário */}
      <div className="flex justify-end">
        <div className="max-w-[85%]">
          <p className="text-right text-xs font-medium text-muted-foreground">
            Você
          </p>
          <p className="mt-1 rounded-lg rounded-tr-sm bg-muted/70 px-3.5 py-2 text-sm text-foreground">
            {displayQuestion(investigation.question)}
          </p>
        </div>
      </div>

      {/* Resposta do agente */}
      <div>
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Sparkles size={12} className="text-primary" />
          Agente
          <span aria-hidden="true">·</span>
          <span className="font-normal">{investigation.datasetName}</span>
        </p>

        {streaming && (
          <p
            role="status"
            className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Loader2 size={14} className="animate-spin" />
            {statusText ?? "Analisando..."}
          </p>
        )}

        {investigation.toolTrace.length > 0 && (
          <ul
            className="mt-2 flex flex-wrap gap-1.5"
            aria-label="Etapas da investigação"
          >
            {investigation.toolTrace.map((step) => (
              <li
                key={step.toolCallId}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs",
                  step.status === "running"
                    ? "border-border bg-muted text-muted-foreground"
                    : step.status === "ok"
                      ? "border-border bg-card text-muted-foreground"
                      : "border-destructive/40 bg-card text-destructive"
                )}
              >
                {step.status === "running" && (
                  <Loader2 size={11} className="animate-spin" />
                )}
                {TRACE_LABELS[step.name] ?? step.name}
              </li>
            ))}
          </ul>
        )}

        {investigation.insight && (
          <div className="mt-2 text-sm leading-relaxed text-foreground">
            <CopilotMarkdown>{investigation.insight}</CopilotMarkdown>
          </div>
        )}

        {investigation.error && (
          <div
            role="alert"
            className="mt-2 rounded-lg border border-destructive/40 bg-card px-4 py-3"
          >
            <p className="text-sm font-medium text-destructive">
              Não foi possível concluir.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {investigation.error}
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {streaming && (
          <div className="mt-2">
            <button
              type="button"
              onClick={onAbort}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Interromper
            </button>
          </div>
        )}
      </div>
    </article>
  )
}
