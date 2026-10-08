"use client"

import { ArrowUp, Loader2, Play } from "lucide-react"
import { cn } from "@/lib/utils"
import { SqlEditor } from "./sql-editor"
import { VisualizationPanel } from "./visualization-panel"
import { buildSuggestions } from "./explore-composer"
import { looksLikeSql } from "@/lib/explorer/sql"
import type { DatasetColumn, DatasetListItem } from "@/lib/api/datasets"
import type {
  PresentationState,
  WorkspaceData,
} from "@/lib/explorer/workspace"

// ---------------------------------------------------------------------------
// Agente IA — campo de consulta elegante (não-chat)
// ---------------------------------------------------------------------------

interface AgentInputProps {
  value: string
  onChange: (value: string) => void
  onAsk: (text: string) => void
  onAskSql: (text: string) => void
  disabled: boolean
  busy: boolean
  hasDataset: boolean
  columns: DatasetColumn[]
  /** Oculta as sugestões quando a conversa já começou. */
  hideSuggestions?: boolean
}

export function AgentInput({
  value,
  onChange,
  onAsk,
  onAskSql,
  disabled,
  busy,
  hasDataset,
  columns,
  hideSuggestions = false,
}: AgentInputProps) {
  const canAsk = Boolean(value.trim()) && !disabled && !busy

  function submit() {
    const text = value.trim()
    if (!text || !canAsk) return
    // Entrada com cara de SQL executa direto, mesmo no modo Agente IA.
    if (looksLikeSql(text)) onAskSql(text)
    else onAsk(text)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <div>
      {!hideSuggestions && (
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          O que você quer descobrir?
        </h2>
      )}
      <div className="mt-3 rounded-lg border border-border bg-card transition-colors focus-within:border-primary focus-within:ring-1 focus-within:ring-ring">
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          aria-label="Pergunte sobre seus dados"
          placeholder={
            hasDataset
              ? "Pergunte sobre seus dados..."
              : "Escolha uma fonte no contexto para começar..."
          }
          disabled={disabled}
          className="w-full resize-none bg-transparent px-4 pt-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-60"
        />
        <div className="flex items-center gap-3 px-3 pb-3">
          <span className="hidden text-xs text-muted-foreground sm:block">
            Enter para investigar · Shift+Enter quebra linha
          </span>
          <button
            type="button"
            onClick={submit}
            disabled={!canAsk}
            aria-label="Investigar"
            className={cn(
              "ml-auto inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors",
              canAsk
                ? "bg-primary text-primary-foreground"
                : "cursor-not-allowed bg-border text-muted-foreground"
            )}
          >
            {busy ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <ArrowUp size={14} />
            )}
          </button>
        </div>
      </div>
      {!hideSuggestions && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {buildSuggestions(columns).map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onChange(suggestion)}
              disabled={disabled}
              className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-60"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SQL — editor na mesma área, resultado compartilhado
// ---------------------------------------------------------------------------

interface SqlInputProps {
  sql: string
  onSqlChange: (sql: string) => void
  onExecute: () => void
  executing: boolean
  disabled: boolean
  hasDataset: boolean
  datasets: DatasetListItem[]
  columns: DatasetColumn[]
}

export function SqlInput({
  sql,
  onSqlChange,
  onExecute,
  executing,
  disabled,
  hasDataset,
  datasets,
  columns,
}: SqlInputProps) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Consulta SQL
        </h2>
        <button
          type="button"
          onClick={onExecute}
          disabled={disabled || executing || !sql.trim()}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-medium transition-colors",
            disabled || executing || !sql.trim()
              ? "cursor-not-allowed bg-border text-muted-foreground"
              : "bg-primary text-primary-foreground"
          )}
        >
          {executing ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Play size={13} />
          )}
          Executar
        </button>
      </div>
      <div className="mt-3">
        <SqlEditor
          value={sql}
          onChange={onSqlChange}
          onExecute={onExecute}
          loading={executing}
          disabled={!hasDataset}
          datasets={datasets}
          columns={columns}
          height="240px"
        />
      </div>
      {!hasDataset && (
        <p className="mt-2 text-xs text-muted-foreground">
          Escolha uma fonte no contexto para executar consultas.
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Visual — etapa de apresentação sobre o resultado compartilhado
// ---------------------------------------------------------------------------

interface VisualInputProps {
  workspace: WorkspaceData | null
  presentation: PresentationState
  onPresentationChange: (presentation: PresentationState) => void
}

export function VisualInput({
  workspace,
  presentation,
  onPresentationChange,
}: VisualInputProps) {
  if (!workspace || workspace.rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
        <p className="text-sm text-muted-foreground">
          Investigue os dados (Agente IA ou SQL) para configurar o visual.
        </p>
      </div>
    )
  }

  return (
    <VisualizationPanel
      data={workspace.rows}
      hideChart
      chartType={presentation.chartType}
      onChartTypeChange={(chartType) =>
        onPresentationChange({ ...presentation, chartType })
      }
      dimension={presentation.dimension}
      onDimensionChange={(dimension) =>
        onPresentationChange({ ...presentation, dimension })
      }
      metric={presentation.metric}
      onMetricChange={(metric) => onPresentationChange({ ...presentation, metric })}
      colorField={presentation.colorField}
      onColorFieldChange={(colorField) =>
        onPresentationChange({ ...presentation, colorField })
      }
      display={presentation.display}
      onDisplayChange={(display) =>
        onPresentationChange({ ...presentation, display })
      }
    />
  )
}
