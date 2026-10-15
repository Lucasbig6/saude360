"use client"

import { useState } from "react"
import { Check, ChevronDown, ChevronRight, Loader2, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Investigation } from "@/hooks/use-explorer-agent"
import type { DatasetListItem } from "@/lib/api/datasets"
import type { WorkspaceData, PresentationState } from "@/lib/explorer/workspace"
import type { Analysis } from "@/lib/types/analysis"
import { presentationFromRows, workspaceFromInvestigation } from "@/lib/explorer/workspace"
import { AgentViz } from "./agent-viz"
import { ResultActions } from "./result-actions"
import { CopilotMarkdown } from "@/components/dashboard/copilot-markdown"
import { displayQuestion } from "@/lib/explorer/chat-context"

interface InvestigationBlockProps {
  investigation: Investigation
  projectId: string
  dataset: DatasetListItem | null
  onRetry: () => void
  onAbort: () => void
  onAnalysisSaved: (analysis: Analysis) => void
  onDatasetPublished: (datasetId: number) => void
  onPinResult?: (workspace: WorkspaceData, presentation: PresentationState) => void
}

const TOOL_STATUS_TEXT: Record<string, string> = {
  get_dataset_schema: "Lendo o schema...",
  get_column_values: "Buscando valores...",
  execute_query: "Executando a consulta...",
  preview_analysis: "Gerando a prévia da análise...",
  create_analysis: "Salvando a análise...",
}

const TRACE_LABELS: Record<string, string> = {
  get_dataset_schema: "Schema",
  get_column_values: "Valores",
  execute_query: "Consulta",
  preview_analysis: "Prévia",
  create_analysis: "Salvamento",
}

/**
 * Turno da conversa: mensagem do usuário (discreta, à direita) + resposta
 * do agente (status, etapas, insight, SQL). A evidência (gráfico/tabela)
 * vive no painel de pré-visualização persistente — não dentro da mensagem.
 */
export function InvestigationBlock({
  investigation,
  projectId,
  dataset,
  onRetry,
  onAbort,
  onAnalysisSaved,
  onDatasetPublished,
  onPinResult,
}: InvestigationBlockProps) {
  const streaming = investigation.status === "streaming"
  const statusText = streaming
    ? investigation.currentTool
      ? (TOOL_STATUS_TEXT[investigation.currentTool] ??
        "Consultando os dados...")
      : "Analisando..."
    : null

  const hasResult = investigation.queryData !== null
  const [presentationState, setPresentationState] = useState<{
    queryData: Investigation["queryData"]
    value: PresentationState
  }>(() => ({
    queryData: investigation.queryData,
    value: presentationFromRows(investigation.queryData?.rows ?? []),
  }))
  const presentation =
    presentationState.queryData === investigation.queryData
      ? presentationState.value
      : presentationFromRows(investigation.queryData?.rows ?? [])
  const [showSql, setShowSql] = useState(false)
  const [resultExpanded, setResultExpanded] = useState(true)
  const resultWorkspace = workspaceFromInvestigation(investigation, dataset)

  function handlePresentationChange(value: PresentationState) {
    setPresentationState({ queryData: investigation.queryData, value })
  }

  return (
    <article
      data-testid={`investigation-${investigation.id}`}
      className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-5 sm:px-6"
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

        {/* Insight da IA */}
        {investigation.insight && (
          <div className="mt-3 border-l-2 border-primary/40 pl-3 text-sm leading-relaxed text-foreground">
            <CopilotMarkdown>{investigation.insight}</CopilotMarkdown>
          </div>
        )}

        {hasResult && investigation.queryData && (
          <div className="mt-4 border-t border-border pt-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-muted-foreground">
                Resultado · {investigation.queryData.rowCount} linhas
              </p>
              <button
                type="button"
                aria-expanded={resultExpanded}
                onClick={() => setResultExpanded((expanded) => !expanded)}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {resultExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                {resultExpanded ? "Recolher" : "Expandir resultado"}
              </button>
            </div>
            {resultExpanded && (
              <>
                <div className="mt-2">
                  <AgentViz
                    rows={investigation.queryData.rows}
                    rowCount={investigation.queryData.rowCount}
                    truncated={investigation.queryData.truncated}
                    executionMs={investigation.queryData.executionMs}
                    presentation={presentation}
                    onPresentationChange={handlePresentationChange}
                    chartHeightClass="h-72"
                    idPrefix={`investigation-${investigation.id}`}
                  />
                </div>
            <ResultActions
              workspace={resultWorkspace}
              presentation={presentation}
              projectId={projectId}
              editingAnalysis={null}
              onAnalysisSaved={onAnalysisSaved}
              onDatasetPublished={onDatasetPublished}
              onShowSql={() => setShowSql((value) => !value)}
              sqlVisible={showSql}
              onPin={
                onPinResult
                  ? () => onPinResult(resultWorkspace, presentation)
                  : undefined
              }
              compact
            />
            {showSql && investigation.sql && (
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-xs text-foreground">
                {investigation.sql}
              </pre>
            )}
              </>
            )}
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
