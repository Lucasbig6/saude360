"use client"

import { KeyboardEvent, useSyncExternalStore } from "react"
import { ArrowUp, Code2, Loader2, Search, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { looksLikeSql } from "@/lib/explorer/sql"
import { SqlEditor } from "./sql-editor"
import { DatasetChip } from "./dataset-chip"
import type { DatasetColumn, DatasetListItem } from "@/lib/api/datasets"

/**
 * Modos do composer: "ai" = Perguntar (linguagem natural, alimentado pelo
 * Agente IA), "sql" = consulta direta. O Agente IA não é uma tab paralela —
 * é o mecanismo por trás do modo Perguntar.
 */
export type ExplorationMode = "sql" | "ai"

interface ExploreComposerProps {
  /** Compacto quando já há investigação em andamento (resultado/pergunta). */
  compact: boolean
  mode: ExplorationMode
  onModeChange: (mode: ExplorationMode) => void

  /** Modo Perguntar */
  value: string
  onChange: (value: string) => void
  onSubmit: (text: string, mode: ExplorationMode) => void

  /** Modo SQL — o próprio composer hospeda o editor Monaco existente. */
  sql: string
  onSqlChange: (sql: string) => void
  onSqlExecute: () => void

  /** Fonte de dados (chip) */
  datasets: DatasetListItem[]
  loadingDatasets: boolean
  selectedDataset: DatasetListItem | null
  onSelectDataset: (dataset: DatasetListItem) => void
  columns: DatasetColumn[]

  executing: boolean
}

const FALLBACK_SUGGESTIONS = [
  "Como evoluíram os atendimentos de janeiro a junho?",
  "Atendimentos por município, do maior para o menor",
  "Total de atendimentos por faixa etária",
]

/**
 * Sugestões ancoradas na fonte selecionada: usam a primeira coluna temporal,
 * dimensão (groupby) e métrica do dataset. Sem colunas, volta ao genérico.
 */
export function buildSuggestions(columns: DatasetColumn[]): string[] {
  const dims = columns
    .filter((c) => c.groupby && !c.is_dttm)
    .map((c) => c.column_name)
  const times = columns.filter((c) => c.is_dttm).map((c) => c.column_name)
  const metrics = columns
    .filter((c) => !c.groupby && !c.is_dttm)
    .map((c) => c.column_name)

  if (dims.length === 0 && times.length === 0 && metrics.length === 0) {
    return FALLBACK_SUGGESTIONS
  }

  const suggestions: string[] = []
  if (times[0] && metrics[0]) {
    suggestions.push(`Como evoluíram ${metrics[0]} ao longo de ${times[0]}?`)
  }
  if (dims[0] && metrics[0]) {
    suggestions.push(`${metrics[0]} por ${dims[0]}, do maior para o menor`)
  }
  if (dims[0]) {
    suggestions.push(`Total por ${dims[0]}`)
  }
  return suggestions.length > 0 ? suggestions : FALLBACK_SUGGESTIONS
}

const subscribeToHydration = () => () => {}
const getHydratedSnapshot = () => true
const getServerHydratedSnapshot = () => false

export function ExploreComposer({
  compact,
  mode,
  onModeChange,
  value,
  onChange,
  onSubmit,
  sql,
  onSqlChange,
  onSqlExecute,
  datasets,
  loadingDatasets,
  selectedDataset,
  onSelectDataset,
  columns,
  executing,
}: ExploreComposerProps) {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    getHydratedSnapshot,
    getServerHydratedSnapshot
  )

  const canAsk =
    Boolean(value.trim()) && Boolean(selectedDataset) && !executing

  function handleAskSubmit() {
    const text = value.trim()
    if (!text || !canAsk) return
    // Detecção: entrada parecida com SQL vira consulta mesmo partindo do
    // modo Perguntar; o toggle continua sendo o controle explícito.
    const effectiveMode: ExplorationMode =
      mode === "ai" && looksLikeSql(text) ? "sql" : mode
    onSubmit(text, effectiveMode)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      handleAskSubmit()
    }
  }

  return (
    <section
      className={cn(
        "shrink-0 flex flex-col px-5 py-6 sm:px-8 xl:px-8",
        compact ? "min-h-0" : "min-h-[22rem]"
      )}
    >
      <div className={cn("w-full", compact ? "" : "mx-auto max-w-3xl xl:pt-8")}>
        <p className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-normal text-muted-foreground">
          <Search size={13} />
          Investigação
        </p>
        <div>
          <h2
            className={cn(
              "font-semibold tracking-tight text-foreground",
              compact ? "text-base sm:text-lg" : "text-2xl"
            )}
          >
            O que você quer descobrir?
          </h2>
          {!compact && (
            <p className="mt-2 text-sm text-muted-foreground">
              Use o contexto à esquerda para orientar esta investigação.
            </p>
          )}
        </div>

        {/* Modos + fonte */}
        <div
          className={cn(
            "mt-5 flex flex-wrap items-center gap-2"
          )}
        >
          <div
            className="inline-flex rounded-lg border border-border bg-muted p-0.5"
            role="group"
            aria-label="Modo de investigação"
          >
            <button
              type="button"
              aria-pressed={mode === "ai"}
              onClick={() => onModeChange("ai")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                mode === "ai"
                  ? "bg-card text-foreground ring-1 ring-border"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Sparkles size={13} />
              Agente IA
            </button>
            <button
              type="button"
              aria-pressed={mode === "sql"}
              onClick={() => onModeChange("sql")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                mode === "sql"
                  ? "bg-card text-foreground ring-1 ring-border"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Code2 size={13} />
              SQL
            </button>
          </div>

          <div className="xl:hidden">
            <DatasetChip
              datasets={datasets}
              loading={loadingDatasets}
              disabled={hydrated && loadingDatasets}
              selected={selectedDataset}
              onSelect={onSelectDataset}
            />
          </div>
        </div>

        {/* Entrada */}
        {mode === "sql" ? (
          <div className="mt-3">
            <SqlEditor
              value={sql}
              onChange={onSqlChange}
              onExecute={onSqlExecute}
              loading={executing}
              disabled={hydrated && !selectedDataset}
              datasets={datasets}
              columns={columns}
              height={compact ? "240px" : undefined}
            />
          </div>
        ) : (
          <div className="mt-3 rounded-lg border border-border bg-muted/50 transition-colors focus-within:border-primary focus-within:ring-1 focus-within:ring-ring">
            <textarea
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={compact ? 1 : 2}
              aria-label="Pergunte algo sobre seus dados"
              placeholder={
                selectedDataset
                  ? "Pergunte ou escreva SQL..."
                  : "Escolha uma fonte no contexto para começar..."
              }
              className="w-full resize-none bg-transparent px-4 pt-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />

            <div className="flex items-center gap-3 px-3 pb-3">
              <span className="hidden text-xs text-muted-foreground sm:block">
                Enter para investigar · Shift+Enter quebra linha
              </span>
              <button
                type="button"
                onClick={handleAskSubmit}
                disabled={!canAsk}
                className={cn(
                  "ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors",
                  canAsk
                    ? "bg-primary text-primary-foreground"
                    : "cursor-not-allowed bg-border text-muted-foreground"
                )}
              >
                {executing ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <ArrowUp size={14} />
                )}
                <span className="sr-only">Investigar</span>
              </button>
            </div>
          </div>
        )}

        {!compact && mode === "ai" && (
          <div className="mt-5 flex flex-wrap gap-2">
            {buildSuggestions(columns).map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => onChange(suggestion)}
                className="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
