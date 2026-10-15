"use client"

import { useState } from "react"
import { FileCode2, Trash2 } from "lucide-react"
import { AgentViz } from "@/components/explorer/agent-viz"
import { ResultActions } from "@/components/explorer/result-actions"
import { CopilotMarkdown } from "@/components/dashboard/copilot-markdown"
import type { StudioItem } from "@/lib/explorer/studio"
import type { PresentationState } from "@/lib/explorer/workspace"
import type { Analysis } from "@/lib/types/analysis"

interface StudioItemCardProps {
  item: StudioItem
  projectId: string
  onRemove: (id: string) => void
  onPresentationChange: (id: string, presentation: PresentationState) => void
  onAnalysisSaved: (id: string, analysis: Analysis) => void
  onDatasetPublished: (datasetId: number) => void
}

/**
 * Item fixado no Estúdio: snapshot autônomo do resultado. A apresentação
 * editada aqui altera somente este item; nada da conversa o sobrescreve.
 */
export function StudioItemCard({
  item,
  projectId,
  onRemove,
  onPresentationChange,
  onAnalysisSaved,
  onDatasetPublished,
}: StudioItemCardProps) {
  const [showSql, setShowSql] = useState(false)
  const { workspace, presentation } = item

  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {item.title}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {workspace.datasetName ?? "Consulta"}
            {" · "}
            {workspace.rowCount} linha{workspace.rowCount !== 1 ? "s" : ""}
            {item.savedAnalysisId && " · Análise salva"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          title="Remover do Estúdio"
          aria-label={`Remover "${item.title}" do Estúdio`}
          className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <AgentViz
        rows={workspace.rows}
        rowCount={workspace.rowCount}
        truncated={workspace.truncated}
        executionMs={workspace.executionMs}
        presentation={presentation}
        onPresentationChange={(next) => onPresentationChange(item.id, next)}
        chartHeightClass="h-90"
      />

      {workspace.insight && (
        <div className="mt-3 border-l-2 border-border pl-3 text-sm leading-relaxed text-muted-foreground">
          <CopilotMarkdown>{workspace.insight}</CopilotMarkdown>
        </div>
      )}

      <ResultActions
        workspace={workspace}
        presentation={presentation}
        projectId={projectId}
        editingAnalysis={null}
        onAnalysisSaved={(analysis) => onAnalysisSaved(item.id, analysis)}
        onDatasetPublished={onDatasetPublished}
        onShowSql={() => setShowSql((v) => !v)}
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
            <span className="inline-flex items-center gap-1.5">
              <FileCode2 size={12} />
              Ocultar SQL
            </span>
          </summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs text-foreground">
            {workspace.sql}
          </pre>
        </details>
      )}
    </article>
  )
}
