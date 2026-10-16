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
  FONT_FAMILIES,
  isChartWidgetConfig,
  isObjectPosition,
  normalizeWidgetConfig,
  type FontFamily,
  type ImageConfig,
  type KpiConfig,
  type TableConfig,
  type TextConfig,
  type ShapeConfig,
  type WidgetStyle,
  type WidgetConfig,
} from "@/lib/types/widgets"
import { prepareDashboardImage } from "@/lib/dashboard-image"

const STATIC_TYPE_LABELS: Record<string, string> = {
  table: "Tabela",
  kpi: "KPI",
  text: "Texto",
  image: "Imagem",
  shape: "Forma",
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
      <span className="text-xs font-medium text-muted-foreground dark:text-muted-foreground">
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
    if (config.type === "text") {
      nextConfig.fontFamily = config.fontFamily
      nextConfig.fontSize = config.fontSize
      nextConfig.fontWeight = config.fontWeight
      nextConfig.color = config.color
      nextConfig.alignment = config.alignment
    }
    return nextConfig
  }

  if (next === "shape") {
    const nextConfig: ShapeConfig = {
      type: "shape",
      shape: config.type === "shape" ? config.shape : "rectangle",
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
        <label className="flex items-center gap-2 text-sm text-foreground dark:text-muted-foreground">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={config.legend ?? true}
            onChange={(e) => patch({ legend: e.target.checked })}
          />
          Exibir legenda
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground dark:text-muted-foreground">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
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
    <div className="space-y-3">
      <Field label="Conteúdo">
        <textarea
          rows={5}
          className={TEXTAREA_CLASS}
          value={config.content}
          placeholder="Texto exibido no widget"
          onChange={(e) => onChange({ ...config, content: e.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Família tipográfica">
          <select className={SELECT_CLASS} value={config.fontFamily ?? ""} onChange={(event) => onChange({ ...config, fontFamily: (event.target.value || undefined) as FontFamily | undefined })}>
            <option value="">Padrão</option>
            {FONT_FAMILIES.map((family) => (
              <option key={family} value={family}>{family}</option>
            ))}
          </select>
        </Field>
        <Field label="Tamanho da fonte">
          <Input type="number" min={10} max={72} value={config.fontSize ?? 14} onChange={(event) => onChange({ ...config, fontSize: Number(event.target.value) })} />
        </Field>
        <Field label="Peso">
          <select className={SELECT_CLASS} value={config.fontWeight ?? 400} onChange={(event) => onChange({ ...config, fontWeight: Number(event.target.value) as TextConfig["fontWeight"] })}>
            <option value={400}>Regular</option><option value={500}>Médio</option><option value={600}>Semibold</option><option value={700}>Negrito</option>
          </select>
        </Field>
        <Field label="Cor do texto">
          <Input type="color" value={config.color ?? "#1f2937"} onChange={(event) => onChange({ ...config, color: event.target.value })} />
        </Field>
        <Field label="Alinhamento">
          <select className={SELECT_CLASS} value={config.alignment ?? "left"} onChange={(event) => onChange({ ...config, alignment: event.target.value as TextConfig["alignment"] })}>
            <option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option>
          </select>
        </Field>
      </div>
    </div>
  )
}

function ImageConfigFields({
  config,
  onChange,
}: {
  config: ImageConfig
  onChange: (config: ImageConfig) => void
}) {
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="grid grid-cols-1 gap-3">
      <Field label="Enviar PNG, JPEG ou SVG">
        <Input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={(event) => {
          const file = event.target.files?.[0]
          if (!file) return
          void prepareDashboardImage(file).then((src) => { setError(null); onChange({ ...config, src }) }).catch((err: unknown) => setError(err instanceof Error ? err.message : "Imagem inválida."))
        }} />
      </Field>
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
      <Field label="Ajuste da imagem">
        <select className={SELECT_CLASS} value={config.fit ?? "contain"} onChange={(event) => onChange({ ...config, fit: event.target.value as ImageConfig["fit"] })}>
          <option value="contain">Conter</option><option value="cover">Cobrir</option><option value="fill">Preencher</option>
        </select>
      </Field>
      <Field label="Posicionamento">
        <select className={SELECT_CLASS} value={config.objectPosition ?? "center"} onChange={(event) => onChange({ ...config, objectPosition: event.target.value })}>
          {["center", "top", "bottom", "left", "right", "top left", "top right", "bottom left", "bottom right"].map((pos) => (
            <option key={pos} value={pos}>{pos}</option>
          ))}
        </select>
      </Field>
      {config.objectPosition !== undefined && !isObjectPosition(config.objectPosition) && (
        <p role="alert" className="text-xs text-destructive">Posicionamento inválido.</p>
      )}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

function ShapeConfigFields({ config, onChange }: { config: ShapeConfig; onChange: (config: ShapeConfig) => void }) {
  return <div className="grid grid-cols-2 gap-3">
    <Field label="Forma"><select className={SELECT_CLASS} value={config.shape} onChange={(event) => onChange({ ...config, shape: event.target.value as ShapeConfig["shape"] })}><option value="rectangle">Retângulo</option><option value="circle">Círculo</option><option value="line">Linha</option><option value="divider">Divisor</option></select></Field>
    <Field label="Preenchimento"><Input type="color" value={config.fill ?? "#f1f5f9"} onChange={(event) => onChange({ ...config, fill: event.target.value })} /></Field>
    <Field label="Contorno"><Input type="color" value={config.stroke ?? "#64748b"} onChange={(event) => onChange({ ...config, stroke: event.target.value })} /></Field>
    <Field label="Espessura"><Input type="number" min={0} max={24} value={config.strokeWidth ?? 1} onChange={(event) => onChange({ ...config, strokeWidth: Number(event.target.value) })} /></Field>
  </div>
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

  function patchStyle(partial: Partial<WidgetStyle>) {
    setDraft({ ...draft, style: { ...draft.style, ...partial } } as WidgetConfig)
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

      <details className="rounded-md border border-border px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium">Aparência e camada</summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Fundo"><Input type="color" value={draft.style?.backgroundColor ?? "#ffffff"} onChange={(event) => patchStyle({ backgroundColor: event.target.value })} /></Field>
          <Field label="Borda"><Input type="color" value={draft.style?.borderColor ?? "#e2e8f0"} onChange={(event) => patchStyle({ borderColor: event.target.value })} /></Field>
          <Field label="Raio"><Input type="number" min={0} max={32} value={draft.style?.borderRadius ?? 8} onChange={(event) => patchStyle({ borderRadius: Number(event.target.value) })} /></Field>
          <Field label="Transparência"><Input type="number" min={0} max={100} value={Math.round((draft.style?.opacity ?? 1) * 100)} onChange={(event) => patchStyle({ opacity: Number(event.target.value) / 100 })} /></Field>
          <Field label="Camada"><Input type="number" min={0} max={1000} value={draft.style?.zIndex ?? 0} onChange={(event) => patchStyle({ zIndex: Number(event.target.value) })} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.style?.visible !== false} onChange={(event) => patchStyle({ visible: event.target.checked })} />Visível</label>
        </div>
      </details>

      {columns.length === 0 && (
        <p className="text-xs text-muted-foreground dark:text-muted-foreground">
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
      ) : draft.type === "shape" ? (
        <ShapeConfigFields config={draft} onChange={setDraft} />
      ) : null}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive dark:border-destructive/40 dark:bg-destructive/20 dark:text-destructive">
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
        >
          Aplicar
        </Button>
      </div>
    </div>
  )
}
