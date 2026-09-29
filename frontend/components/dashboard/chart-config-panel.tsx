"use client"

import { useState } from "react"
import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { chartTypeLabel } from "@/components/charts/chart-types"
import type { DatasetColumn } from "@/lib/api/datasets"
import {
  CHART_TYPES,
  isChartType,
  isWidgetType,
  type AggregationFunction,
  type ChartConfig,
  type ChartEncoding,
  type WidgetType,
} from "@/lib/charts/chart-config"
import {
  STATIC_WIDGET_TYPES,
  isChartWidgetConfig,
  normalizeWidgetConfig,
  type ImageConfig,
  type KpiConfig,
  type TableConfig,
  type TextConfig,
  type WidgetConfig,
} from "@/lib/types/widgets"

const STATIC_TYPE_LABELS: Record<string, string> = {
  table: "Tabela",
  kpi: "KPI",
  text: "Texto",
  image: "Imagem",
}

const SELECT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"

const TEXTAREA_CLASS =
  "w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"

const AGGREGATION_FUNCTIONS: AggregationFunction[] = [
  "sum",
  "avg",
  "count",
  "min",
  "max",
]

const AGGREGATION_LABELS: Record<AggregationFunction, string> = {
  sum: "Soma",
  avg: "Média",
  count: "Contagem",
  min: "Mínimo",
  max: "Máximo",
}

function Field({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <label className={className ? `flex flex-col gap-1.5 ${className}` : "flex flex-col gap-1.5"}>
      <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
        {label}
      </span>
      {children}
    </label>
  )
}

/**
 * Troca o tipo do widget preservando o que faz sentido cruzar tipos:
 * título sempre, limit entre gráfico/tabela, encoding entre gráficos e
 * campo/função do KPI quando o destino também é KPI.
 */
export function changeWidgetType(
  config: WidgetConfig,
  next: WidgetType
): WidgetConfig {
  const title = config.title
  const limit = "limit" in config && typeof config.limit === "number" ? config.limit : undefined

  if (isChartType(next)) {
    const nextConfig: ChartConfig = { type: next }
    if (title) nextConfig.title = title
    if (isChartWidgetConfig(config)) {
      nextConfig.legend = config.legend ?? true
      nextConfig.tooltip = config.tooltip ?? true
      if (config.encoding) nextConfig.encoding = { ...config.encoding }
      if (config.sort) nextConfig.sort = { ...config.sort }
      if (config.aggregation) nextConfig.aggregation = { ...config.aggregation }
    } else {
      nextConfig.legend = true
      nextConfig.tooltip = true
    }
    if (limit !== undefined) nextConfig.limit = limit
    return nextConfig
  }

  if (next === "table") {
    const nextConfig: TableConfig = { type: "table" }
    if (title) nextConfig.title = title
    if (limit !== undefined) nextConfig.limit = limit
    return nextConfig
  }

  if (next === "kpi") {
    const nextConfig: KpiConfig = { type: "kpi" }
    if (title) nextConfig.title = title
    if (config.type === "kpi") {
      if (config.field) nextConfig.field = config.field
      if (config.function) nextConfig.function = config.function
    }
    return nextConfig
  }

  if (next === "text") {
    const nextConfig: TextConfig = {
      type: "text",
      content: config.type === "text" ? config.content : "",
    }
    if (title) nextConfig.title = title
    return nextConfig
  }

  const nextConfig: ImageConfig = {
    type: "image",
    src: config.type === "image" ? config.src : "",
  }
  if (title) nextConfig.title = title
  if (config.type === "image" && config.alt) nextConfig.alt = config.alt
  return nextConfig
}

function ColumnSelect({
  columns,
  value,
  onChange,
  emptyLabel = "—",
}: {
  columns: string[]
  value: string | undefined
  onChange: (value: string) => void
  emptyLabel?: string
}) {
  return (
    <select
      className={SELECT_CLASS}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{emptyLabel}</option>
      {columns.map((column) => (
        <option key={column} value={column}>
          {column}
        </option>
      ))}
    </select>
  )
}

function ChartConfigFields({
  config,
  columns,
  onChange,
}: {
  config: ChartConfig
  columns: string[]
  onChange: (config: ChartConfig) => void
}) {
  function patch(partial: Partial<ChartConfig>) {
    onChange({ ...config, ...partial })
  }

  function patchEncoding(key: keyof ChartEncoding, value: string) {
    const encoding: ChartEncoding = { ...config.encoding }
    if (value) {
      encoding[key] = value
    } else {
      delete encoding[key]
    }
    onChange({
      ...config,
      encoding: Object.keys(encoding).length > 0 ? encoding : undefined,
    })
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Dimensão (X)">
          <ColumnSelect
            columns={columns}
            value={config.encoding?.x}
            onChange={(v) => patchEncoding("x", v)}
          />
        </Field>
        <Field label="Métrica (Y)">
          <ColumnSelect
            columns={columns}
            value={config.encoding?.y}
            onChange={(v) => patchEncoding("y", v)}
          />
        </Field>
        <Field label="Categoria / série">
          <ColumnSelect
            columns={columns}
            value={config.encoding?.color}
            onChange={(v) => patchEncoding("color", v)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Agregação (campo)">
          <ColumnSelect
            columns={columns}
            value={config.aggregation?.field}
            onChange={(v) =>
              patch({
                aggregation: v
                  ? {
                      field: v,
                      function: config.aggregation?.function ?? "sum",
                    }
                  : undefined,
              })
            }
          />
        </Field>
        <Field label="Função">
          <select
            className={SELECT_CLASS}
            value={config.aggregation?.function ?? ""}
            disabled={!config.aggregation}
            onChange={(e) => {
              if (!config.aggregation || !e.target.value) return
              patch({
                aggregation: {
                  field: config.aggregation.field,
                  function: e.target.value as AggregationFunction,
                },
              })
            }}
          >
            <option value="">—</option>
            {AGGREGATION_FUNCTIONS.map((fn) => (
              <option key={fn} value={fn}>
                {AGGREGATION_LABELS[fn]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Limite de itens">
          <Input
            type="number"
            min={1}
            value={config.limit ?? ""}
            placeholder="sem limite"
            onChange={(e) =>
              patch({
                limit: e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Ordenar por">
          <ColumnSelect
            columns={columns}
            value={config.sort?.field}
            onChange={(v) =>
              patch({
                sort: v
                  ? { field: v, direction: config.sort?.direction ?? "asc" }
                  : undefined,
              })
            }
          />
        </Field>
        <Field label="Direção">
          <select
            className={SELECT_CLASS}
            value={config.sort?.direction ?? ""}
            disabled={!config.sort}
            onChange={(e) => {
              if (!config.sort || !e.target.value) return
              patch({
                sort: {
                  field: config.sort.field,
                  direction: e.target.value as "asc" | "desc",
                },
              })
            }}
          >
            <option value="">—</option>
            <option value="asc">Crescente</option>
            <option value="desc">Decrescente</option>
          </select>
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            className="h-4 w-4 accent-teal-600"
            checked={config.legend ?? true}
            onChange={(e) => patch({ legend: e.target.checked })}
          />
          Exibir legenda
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            className="h-4 w-4 accent-teal-600"
            checked={config.tooltip ?? true}
            onChange={(e) => patch({ tooltip: e.target.checked })}
          />
          Exibir tooltip
        </label>
      </div>
    </>
  )
}

function TableConfigFields({
  config,
  onChange,
}: {
  config: TableConfig
  onChange: (config: TableConfig) => void
}) {
  return (
    <Field label="Limite de linhas">
      <Input
        type="number"
        min={1}
        className="max-w-[160px]"
        value={config.limit ?? ""}
        placeholder="50"
        onChange={(e) =>
          onChange({
            ...config,
            limit: e.target.value === "" ? undefined : Number(e.target.value),
          })
        }
      />
    </Field>
  )
}

function KpiConfigFields({
  config,
  columns,
  onChange,
}: {
  config: KpiConfig
  columns: string[]
  onChange: (config: KpiConfig) => void
}) {
  const isCount = (config.function ?? "sum") === "count"

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="Função">
        <select
          className={SELECT_CLASS}
          value={config.function ?? "sum"}
          onChange={(e) =>
            onChange({
              ...config,
              function: e.target.value as AggregationFunction,
            })
          }
        >
          {AGGREGATION_FUNCTIONS.map((fn) => (
            <option key={fn} value={fn}>
              {AGGREGATION_LABELS[fn]}
            </option>
          ))}
        </select>
      </Field>
      <Field label={isCount ? "Campo (desnecessário na contagem)" : "Campo"}>
        <ColumnSelect
          columns={columns}
          value={config.field}
          onChange={(field) => onChange({ ...config, field: field || undefined })}
        />
      </Field>
    </div>
  )
}

function TextConfigFields({
  config,
  onChange,
}: {
  config: TextConfig
  onChange: (config: TextConfig) => void
}) {
  return (
    <Field label="Conteúdo">
      <textarea
        rows={5}
        className={TEXTAREA_CLASS}
        value={config.content}
        placeholder="Texto exibido no widget"
        onChange={(e) => onChange({ ...config, content: e.target.value })}
      />
    </Field>
  )
}

function ImageConfigFields({
  config,
  onChange,
}: {
  config: ImageConfig
  onChange: (config: ImageConfig) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-3">
      <Field label="URL da imagem">
        <Input
          value={config.src}
          placeholder="https://..."
          onChange={(e) => onChange({ ...config, src: e.target.value })}
        />
      </Field>
      <Field label="Texto alternativo (opcional)">
        <Input
          value={config.alt ?? ""}
          placeholder="Descrição para leitores de tela"
          onChange={(e) => onChange({ ...config, alt: e.target.value || undefined })}
        />
      </Field>
    </div>
  )
}

interface ChartConfigPanelProps {
  config: WidgetConfig
  columns: DatasetColumn[]
  onApply: (config: WidgetConfig) => void
  onCancel?: () => void
  busy?: boolean
}

export function ChartConfigPanel({
  config,
  columns,
  onApply,
  onCancel,
  busy = false,
}: ChartConfigPanelProps) {
  const [draft, setDraft] = useState<WidgetConfig>(config)
  const [error, setError] = useState<string | null>(null)

  const columnNames = columns.map((column) => column.column_name)

  function handleTypeChange(value: string) {
    if (!isWidgetType(value) || value === draft.type) return
    setDraft(changeWidgetType(draft, value))
    setError(null)
  }

  function handleApply() {
    try {
      const normalized = normalizeWidgetConfig(draft)
      setError(null)
      onApply(normalized)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Configuração inválida.")
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Tipo de widget">
          <select
            className={SELECT_CLASS}
            value={draft.type}
            onChange={(e) => handleTypeChange(e.target.value)}
          >
            <optgroup label="Gráficos">
              {CHART_TYPES.map((type) => (
                <option key={type} value={type}>
                  {chartTypeLabel(type)}
                </option>
              ))}
            </optgroup>
            <optgroup label="Conteúdo">
              {STATIC_WIDGET_TYPES.map((type) => (
                <option key={type} value={type}>
                  {STATIC_TYPE_LABELS[type]}
                </option>
              ))}
            </optgroup>
          </select>
        </Field>
        <Field label="Título (opcional)">
          <Input
            value={draft.title ?? ""}
            placeholder="Nome da análise"
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </Field>
      </div>

      {columns.length === 0 && (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Sem colunas disponíveis para os campos deste widget.
        </p>
      )}

      {isChartWidgetConfig(draft) ? (
        <ChartConfigFields
          config={draft}
          columns={columnNames}
          onChange={setDraft}
        />
      ) : draft.type === "table" ? (
        <TableConfigFields config={draft} onChange={setDraft} />
      ) : draft.type === "kpi" ? (
        <KpiConfigFields
          config={draft}
          columns={columnNames}
          onChange={setDraft}
        />
      ) : draft.type === "text" ? (
        <TextConfigFields config={draft} onChange={setDraft} />
      ) : draft.type === "image" ? (
        <ImageConfigFields config={draft} onChange={setDraft} />
      ) : null}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
          <AlertCircle size={14} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button
          size="sm"
          onClick={handleApply}
          disabled={busy}
          className="bg-teal-600 text-white hover:bg-teal-700"
        >
          Aplicar
        </Button>
      </div>
    </div>
  )
}
