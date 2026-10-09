"use client"

import { useState } from "react"
import { Check, FileCode2, Loader2, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Investigation } from "@/hooks/use-explorer-agent"
import { CopilotMarkdown } from "@/components/dashboard/copilot-markdown"
import { displayQuestion } from "@/lib/explorer/chat-context"
import { AgentViz } from "./agent-viz"
import { ResultActions } from "./result-actions"
import type { PresentationState } from "@/lib/explorer/workspace"

interface InvestigationBlockProps {
  investigation: Investigation
  onRetry: () => void
  onAbort: () => void
  onPresentationChange?: (presentation: PresentationState) => void
  presentation?: PresentationState
  onSaveAnalysis?: () => void
  onAddToDashboard?: () => void
  onDatasetPublished?: (datasetId: number) => void
  onEditVisual?: () => void
  projectId: string
  editingAnalysis?: unknown
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
 * + resposta do agente com resultado inline (gráfico/tabela/SQL).
 *
 * O resultado é um componente rico da resposta — não um painel lateral.
 * A conversa é a narrativa, o resultado é a evidência.
 */
export function InvestigationBlock({
  investigation,
  onRetry,
  onAbort,
  onPresentationChange,
  presentation,
  onSaveAnalysis,
  onAddToDashboard,
  onDatasetPublished,
  onEditVisual,
  projectId,
  editingAnalysis,
}: InvestigationBlockProps) {
  const streaming = investigation.status === "streaming"
  const statusText = streaming
    ? investigation.currentTool
      ? (TOOL_STATUS_TEXT[investigation.currentTool] ??
        "Consultando os dados...")
      : "Analisando..."
    : null

  const [showSql, setShowSql] = useState(false)

  const hasResult = investigation.queryData !== null && investigation.queryData.rows.length > 0

  return (
    <article
      data-testid={`investigation-${investigation.id}`}
      className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-5 py-6 sm:px-8"
    >
      {/* Mensagem do usuário */}
      <div className="flex justify-end">
        <div className="max-w-[85%]">
          <div className="mb-1.5 flex items-center justify-end gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Você
            </span>
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
              <span className="text-[10px] font-semibold">EU</span>
            </div>
          </div>
          <div className="rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground shadow-sm">
            {displayQuestion(investigation.question)}
          </div>
        </div>
      </div>

      {/* Resposta do agente */}
      <div className="rounded-2xl border border-border bg-card/80 p-3 shadow-sm sm:p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Sparkles size={12} />
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Agente
          </span>
          <span aria-hidden="true" className="text-muted-foreground">
            ·
          </span>
          <span className="text-xs text-muted-foreground">
            {investigation.datasetName}
          </span>
        </div>

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
            className="mt-3 flex flex-wrap gap-1.5"
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
                {step.status === "ok" && <Check size={11} />}
                {TRACE_LABELS[step.name] ?? step.name}
              </li>
            ))}
          </ul>
        )}

        {/* Resultado inline: gráfico/tabela */}
        {hasResult && investigation.queryData && (
          <div className="mt-3">
            <AgentViz
              rows={investigation.queryData.rows}
              rowCount={investigation.queryData.rowCount}
              truncated={investigation.queryData.truncated}
              executionMs={investigation.queryData.executionMs}
              presentation={presentation}
              onPresentationChange={onPresentationChange}
            />
          </div>
        )}

        {/* Insight da IA */}
        {investigation.insight && (
          <div className="mt-3 rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-sm leading-relaxed text-foreground">
            <CopilotMarkdown>{investigation.insight}</CopilotMarkdown>
          </div>
        )}

        {/* SQL expansível */}
        {investigation.sql && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowSql((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <FileCode2 size={12} />
              {showSql ? "Ocultar SQL" : "Ver SQL"}
            </button>
            {showSql && (
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/40 px-4 py-2.5 font-mono text-xs text-foreground">
                {investigation.sql}
              </pre>
            )}
          </div>
        )}

        {/* Ações do resultado */}
        {hasResult && onSaveAnalysis && (
          <ResultActions
            workspace={{
              rows: investigation.queryData?.rows ?? [],
              rowCount: investigation.queryData?.rowCount ?? 0,
              truncated: investigation.queryData?.truncated ?? false,
              executionMs: investigation.queryData?.executionMs,
              sql: investigation.sql,
              question: displayQuestion(investigation.question),
              insight: investigation.insight || null,
              source: "agent",
              datasetId: investigation.datasetId,
              datasetName: investigation.datasetName,
              investigationId: investigation.id,
              savedAnalysis: investigation.savedAnalysis,
            }}
            presentation={presentation!}
            projectId={projectId}
            editingAnalysis={editingAnalysis as never}
            onAnalysisSaved={() => {}}
            onDatasetPublished={onDatasetPublished ?? (() => {})}
            onShowSql={() => setShowSql((v) => !v)}
            onEditVisual={onEditVisual ?? (() => {})}
            compact
          />
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
