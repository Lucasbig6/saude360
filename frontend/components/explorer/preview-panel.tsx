"use client"

import { useState } from "react"
import { Filter, Loader2 } from "lucide-react"
import { AgentViz } from "./agent-viz"
import { ResultActions } from "./result-actions"
import { CopilotMarkdown } from "@/components/dashboard/copilot-markdown"
import type { Investigation } from "@/hooks/use-explorer-agent"
import type { AnalysisFilter } from "@/lib/charts/chart-config"
import type { PresentationState, WorkspaceData } from "@/lib/explorer/workspace"
import type { Analysis } from "@/lib/types/analysis"

export interface PreviewPanelProps {
  /** Resultado atual — null = nada executado ainda. */
  workspace: WorkspaceData | null
  presentation: PresentationState
  onPresentationChange: (presentation: PresentationState) => void
  /** Filtros informativos da análise em edição (chips). */
  filters: AnalysisFilter[]
  /** Streaming do agente ou execução SQL em andamento. */
  streaming: boolean
  statusText: string | null
  error: string | null
  pendingConfirmation: Investigation["pendingConfirmation"]
  onRetry: () => void
  onAbort: () => void
  onConfirm: () => void
  onDismiss: () => void
  projectId: string
  /** Análise em edição: salvar atualiza em vez de duplicar. */
  editingAnalysis: Analysis | null
  onAnalysisSaved: (analysis: Analysis) => void
  onDatasetPublished: (datasetId: number) => void
  onEditVisual: () => void
  /** Explicação da IA aparece fora do chat (abas SQL/Visual). */
  showInsight?: boolean
}

/**
 * Pré-visualização persistente da análise em edição: gráfico/tabela dos
 * dados reais + filtros informativos, erro com retry sem apagar a última
 * visualização válida e as ações de salvamento/publicação.
 */
export function PreviewPanel({
  workspace,
  presentation,
  onPresentationChange,
  filters,
  streaming,
  statusText,
  error,
  pendingConfirmation,
  onRetry,
  onAbort,
  onConfirm,
  onDismiss,
  projectId,
  editingAnalysis,
  onAnalysisSaved,
  onDatasetPublished,
  onEditVisual,
  showInsight = false,
}: PreviewPanelProps) {
  const [showSql, setShowSql] = useState(false)

  const header = (
    <div className="mb-2 flex items-center justify-between gap-4">
      <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
        Pré-visualização
      </p>
      {streaming && (
        <p
          role="status"
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <Loader2 size={12} className="animate-spin" />
          {statusText ?? "Processando..."}
        </p>
      )}
    </div>
  )

  const chips =
    filters.length > 0 ? (
      <div
        className="mb-2 flex flex-wrap gap-1.5"
        aria-label="Filtros aplicados"
      >
        {filters.map((filter, index) => (
          <span
            key={`${filter.field}-${index}`}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground"
          >
            <Filter size={10} />
            {filter.field} {filter.operator}{" "}
            {Array.isArray(filter.value)
              ? filter.value.join(", ")
              : String(filter.value ?? "")}
          </span>
        ))}
      </div>
    ) : null

  const errorBox = error ? (
    <div
      role="alert"
      className="mt-3 rounded-lg border border-destructive/40 bg-card px-4 py-3"
    >
      <p className="text-sm font-medium text-destructive">
        Não foi possível concluir.
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{error}</p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
        >
          Tentar novamente
        </button>
        {streaming && (
          <button
            type="button"
            onClick={onAbort}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Interromper
          </button>
        )}
      </div>
    </div>
  ) : null

  const confirmationBox = pendingConfirmation ? (
    <div
      role="alert"
      className="mt-3 rounded-lg border border-primary/40 bg-card px-4 py-3"
    >
      <p className="text-sm font-medium text-foreground">
        O agente quer salvar esta investigação como análise. Confirmar?
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={streaming}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        >
          Confirmar e salvar
        </button>
        <button
          type="button"
          onClick={onDismiss}
          disabled={streaming}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
        >
          Descartar
        </button>
      </div>
    </div>
  ) : null

  if (!workspace) {
    return (
      <div className="p-4">
        {header}
        {streaming || error ? (
          <>
            {!error && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={14} className="animate-spin" />
                {statusText ?? "Processando..."}
              </div>
            )}
            {!error && (
              <div className="mt-3 space-y-2" aria-hidden="true">
                <div className="h-40 animate-pulse rounded-lg bg-muted" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
              </div>
            )}
            {errorBox}
          </>
        ) : (
          <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-6 text-center">
            <p className="text-sm text-muted-foreground">
              Faça uma pergunta ou execute uma consulta para ver o resultado
              aqui.
            </p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-4">
      {header}
      {chips}
      {streaming && workspace.rows.length === 0 ? (
        <div className="space-y-2" aria-hidden="true">
          <div className="h-40 animate-pulse rounded-lg bg-muted" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
        </div>
      ) : (
        <>
          <AgentViz
            rows={workspace.rows}
            rowCount={workspace.rowCount}
            truncated={workspace.truncated}
            executionMs={workspace.executionMs}
            presentation={presentation}
            onPresentationChange={onPresentationChange}
            chartHeightClass="h-90"
          />
          {showInsight && workspace.source === "agent" && workspace.insight && (
            <div className="mt-3 border-l-2 border-border pl-3 text-sm leading-relaxed text-muted-foreground">
              <CopilotMarkdown>{workspace.insight}</CopilotMarkdown>
            </div>
          )}
          {errorBox}
          {confirmationBox}
          <ResultActions
            workspace={workspace}
            presentation={presentation}
            projectId={projectId}
            editingAnalysis={editingAnalysis}
            onAnalysisSaved={onAnalysisSaved}
            onDatasetPublished={onDatasetPublished}
            onShowSql={() => setShowSql((v) => !v)}
            onEditVisual={onEditVisual}
          />
          {showSql && workspace.sql && (
            <details
              open
              className="mt-3 rounded-lg border border-border bg-muted/40 px-4 py-2.5"
            >
              <summary
                className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground"
                onClick={(event) => {
                  event.preventDefault()
                  setShowSql(false)
                }}
              >
                Ocultar SQL
              </summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs text-foreground">
                {workspace.sql}
              </pre>
            </details>
          )}
        </>
      )}
    </div>
  )
}
