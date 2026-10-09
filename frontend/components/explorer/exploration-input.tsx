"use client"

import { useSyncExternalStore } from "react"
import { ArrowUp, Loader2, Play, BotMessageSquare } from "lucide-react"
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

const subscribeToHydration = () => () => {}
const getHydratedSnapshot = () => true
const getServerHydratedSnapshot = () => false

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
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    getHydratedSnapshot,
    getServerHydratedSnapshot
  )
  const hydratedReady = Boolean(hydrated)
  const isDisabled = Boolean(disabled)
  const canAsk =
    hydratedReady && Boolean(value.trim()) && !isDisabled && !busy

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
        <div className="mt-8 mb-6">
          <div className="flex items-center gap-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
              <BotMessageSquare size={20} />
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                Explore seus dados
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Faça uma pergunta, escreva SQL ou explore visualmente.
              </p>
            </div>
          </div>
        </div>
      )}
      <div className="rounded-xl border border-border bg-gradient-to-br from-primary/[0.03] to-transparent transition-colors focus-within:border-primary focus-within:ring-1 focus-within:ring-ring">
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
          disabled={isDisabled}
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
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {buildSuggestions(columns).map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onChange(suggestion)}
              disabled={isDisabled}
              className="group flex items-center gap-2.5 rounded-xl border border-border bg-gradient-to-br from-primary/[0.04] to-transparent px-3.5 py-2.5 text-left text-sm text-muted-foreground transition-all hover:border-primary/40 hover:text-foreground hover:shadow-sm disabled:opacity-60"
            >
              <BotMessageSquare
                size={14}
                className="shrink-0 text-primary/60 transition-colors group-hover:text-primary"
              />
              <span className="line-clamp-2">{suggestion}</span>
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
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
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
          height="320px"
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
