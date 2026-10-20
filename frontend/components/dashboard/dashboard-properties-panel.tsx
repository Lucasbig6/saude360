"use client"

import { useEffect, useState } from "react"
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Settings2,
  Trash2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type {
  DashboardFilter,
  DashboardWidget,
} from "@/lib/types/dashboard"
import {
  isChartWidgetConfig,
  legacyToWidgetConfig,
  normalizeWidgetConfig,
  type WidgetConfig,
  type WidgetStyle,
} from "@/lib/types/widgets"
import { getAnalysis, getAnalyses } from "@/lib/api/analyses"
import { getDataset, type DatasetColumn } from "@/lib/api/datasets"
import {
  DEFAULT_REPORT_PAGE,
  type CanvasPageLayout,
  type PixelRect,
} from "@/lib/canvas-layout"
import { STAGE_MIN_HEIGHT, STAGE_MIN_WIDTH, type PageAlignEdge } from "./canvas-stage"
import {
  coerceFilterValue,
  operatorForControlType,
} from "@/lib/dashboard-filters"
import type { Analysis } from "@/lib/types/analysis"
import { ChartConfigPanel } from "./chart-config-panel"

const SELECT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring dark:bg-input/30"

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 border-b border-border px-4 py-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function parseIntInRange(
  raw: string,
  min: number,
  max: number
): number | null {
  if (!/^\d+$/.test(raw.trim())) return null
  const value = Number(raw)
  if (!Number.isInteger(value) || value < min || value > max) return null
  return value
}

function LayoutSection({
  pixel,
  page,
  onSave,
}: {
  pixel?: PixelRect
  page?: CanvasPageLayout
  onSave: (pixel: PixelRect) => void
}) {
  // Editor livre: coordenadas em pixels da página (1920×1080 por padrão).
  const bounds = page ?? DEFAULT_REPORT_PAGE
  const layoutKey = pixel
    ? `${Math.round(pixel.x)},${Math.round(pixel.y)},${Math.round(pixel.w)},${Math.round(pixel.h)}`
    : "none"
  const [state, setState] = useState<{ key: string; draft: Record<"x" | "y" | "w" | "h", string>; error: string | null } | null>(null)
  const shown = state?.key === layoutKey
    ? state
    : {
        key: layoutKey,
        draft: {
          x: String(pixel ? Math.round(pixel.x) : 0),
          y: String(pixel ? Math.round(pixel.y) : 0),
          w: String(pixel ? Math.round(pixel.w) : 0),
          h: String(pixel ? Math.round(pixel.h) : 0),
        },
        error: null as string | null,
      }
  const { draft, error } = shown

  const maxX = Math.max(0, Math.round(bounds.width) - STAGE_MIN_WIDTH)
  const maxY = Math.max(0, Math.round(bounds.height) - STAGE_MIN_HEIGHT)

  function commit(next: typeof draft) {
    if (!pixel) return
    const x = parseIntInRange(next.x, 0, maxX)
    const y = parseIntInRange(next.y, 0, maxY)
    const w = parseIntInRange(next.w, STAGE_MIN_WIDTH, Math.round(bounds.width))
    const h = parseIntInRange(next.h, STAGE_MIN_HEIGHT, Math.round(bounds.height))
    if (x === null || y === null || w === null || h === null) {
      setState({
        key: layoutKey,
        draft: next,
        error: `Use pixels dentro da página (${Math.round(bounds.width)}×${Math.round(bounds.height)}): X 0–${maxX}, Y 0–${maxY}, largura ${STAGE_MIN_WIDTH}–${Math.round(bounds.width)} e altura ${STAGE_MIN_HEIGHT}–${Math.round(bounds.height)}.`,
      })
      return
    }
    setState({ key: layoutKey, draft: next, error: null })
    if (
      x === Math.round(pixel.x) &&
      y === Math.round(pixel.y) &&
      w === Math.round(pixel.w) &&
      h === Math.round(pixel.h)
    ) {
      return
    }
    onSave({ x, y, w, h })
  }

  if (!pixel) return null

  return (
    <Section title="Dimensões e posicionamento (px)">
      <div className="grid grid-cols-4 gap-2">
        <Field label="X">
          <Input
            type="number"
            className="h-8 text-xs"
            value={draft.x}
            min={0}
            max={maxX}
            onChange={(event) => commit({ ...draft, x: event.target.value })}
          />
        </Field>
        <Field label="Y">
          <Input
            type="number"
            className="h-8 text-xs"
            value={draft.y}
            min={0}
            max={maxY}
            onChange={(event) => commit({ ...draft, y: event.target.value })}
          />
        </Field>
        <Field label="Largura">
          <Input
            type="number"
            className="h-8 text-xs"
            value={draft.w}
            min={STAGE_MIN_WIDTH}
            max={Math.round(bounds.width)}
            onChange={(event) => commit({ ...draft, w: event.target.value })}
          />
        </Field>
        <Field label="Altura">
          <Input
            type="number"
            className="h-8 text-xs"
            value={draft.h}
            min={STAGE_MIN_HEIGHT}
            max={Math.round(bounds.height)}
            onChange={(event) => commit({ ...draft, h: event.target.value })}
          />
        </Field>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </Section>
  )
}

function AlignSection({ onAlign }: { onAlign: (edge: PageAlignEdge) => void }) {
  const actions: { edge: PageAlignEdge; label: string; title: string }[] = [
    { edge: "left", label: "Esq", title: "Alinhar à esquerda" },
    { edge: "center-h", label: "Centro", title: "Centralizar horizontalmente" },
    { edge: "right", label: "Dir", title: "Alinhar à direita" },
    { edge: "top", label: "Topo", title: "Alinhar ao topo" },
    { edge: "middle", label: "Meio", title: "Centralizar verticalmente" },
    { edge: "bottom", label: "Base", title: "Alinhar à base" },
  ]
  return (
    <Section title="Alinhar à página">
      <div className="grid grid-cols-3 gap-2">
        {actions.map((action) => (
          <Button
            key={action.edge}
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            title={action.title}
            onClick={() => onAlign(action.edge)}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </Section>
  )
}

function StyleSection({
  config,
  onSave,
}: {
  config: WidgetConfig
  onSave: (config: WidgetConfig) => void
}) {
  function patchStyle(partial: Partial<WidgetStyle>) {
    onSave({ ...config, style: { ...config.style, ...partial } })
  }

  return (
    <Section title="Aparência">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Fundo">
          <Input
            type="color"
            value={config.style?.backgroundColor ?? "#ffffff"}
            onChange={(event) => patchStyle({ backgroundColor: event.target.value })}
          />
        </Field>
        <Field label="Borda">
          <Input
            type="color"
            value={config.style?.borderColor ?? "#e2e8f0"}
            onChange={(event) => patchStyle({ borderColor: event.target.value })}
          />
        </Field>
        <Field label="Espessura">
          <Input
            type="number"
            min={0}
            max={16}
            className="h-8 text-xs"
            value={config.style?.borderWidth ?? ""}
            placeholder="0–16"
            onChange={(event) => {
              const value = event.target.value === "" ? undefined : Number(event.target.value)
              if (value === undefined || (value >= 0 && value <= 16)) {
                patchStyle({ borderWidth: value })
              }
            }}
          />
        </Field>
        <Field label="Raio">
          <Input
            type="number"
            min={0}
            max={32}
            className="h-8 text-xs"
            value={config.style?.borderRadius ?? ""}
            placeholder="0–32"
            onChange={(event) => {
              const value = event.target.value === "" ? undefined : Number(event.target.value)
              if (value === undefined || (value >= 0 && value <= 32)) {
                patchStyle({ borderRadius: value })
              }
            }}
          />
        </Field>
        <Field label="Sombra">
          <select
            className={SELECT_CLASS}
            value={config.style?.shadow ?? "none"}
            onChange={(event) =>
              patchStyle({ shadow: event.target.value as WidgetStyle["shadow"] })
            }
          >
            <option value="none">Nenhuma</option>
            <option value="sm">Suave</option>
            <option value="md">Média</option>
          </select>
        </Field>
        <Field label="Opacidade (%)">
          <Input
            type="number"
            min={0}
            max={100}
            className="h-8 text-xs"
            value={Math.round((config.style?.opacity ?? 1) * 100)}
            onChange={(event) => {
              const value = Number(event.target.value)
              if (Number.isFinite(value) && value >= 0 && value <= 100) {
                patchStyle({ opacity: value / 100 })
              }
            }}
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 accent-primary"
          checked={config.style?.visible !== false}
          onChange={(event) => patchStyle({ visible: event.target.checked })}
        />
        Visível no painel
      </label>
    </Section>
  )
}

function LayerSection({
  onBringToFront,
  onSendToBack,
  onChangeLayer,
  currentLayer,
}: {
  onBringToFront: () => void
  onSendToBack: () => void
  onChangeLayer?: (layer: "background" | "data" | "foreground") => void
  currentLayer?: "background" | "data" | "foreground"
}) {
  return (
    <Section title="Camadas">
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onBringToFront}>
          <ArrowUp size={13} />
          Trazer para frente
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onSendToBack}>
          <ArrowDown size={13} />
          Enviar para trás
        </Button>
      </div>
      {onChangeLayer && currentLayer && (
        <Field label="Camada">
          <select
            className={SELECT_CLASS}
            value={currentLayer}
            onChange={(e) => onChangeLayer(e.target.value as "background" | "data" | "foreground")}
          >
            <option value="background">Fundo</option>
            <option value="data">Dados</option>
            <option value="foreground">Frente</option>
          </select>
        </Field>
      )}
      <p className="text-xs text-muted-foreground">
        A camada controla a ordem visual. Elementos de fundo ficam atrás dos
        gráficos; elementos de frente ficam acima.
      </p>
    </Section>
  )
}

function FilterSection({
  filter,
  linkedCards,
  scopeOptions,
  runtimeValue,
  onSave,
  onClearValue,
}: {
  filter: DashboardFilter
  linkedCards: number
  scopeOptions: { id: string; name: string }[]
  runtimeValue: string | string[]
  onSave: (patch: Partial<DashboardFilter>) => void
  onClearValue: () => void
}) {
  const [nameLoad, setNameLoad] = useState<{
    key: number
    name: string | null
  } | null>(null)

  useEffect(() => {
    if (nameLoad?.key === filter.datasetId) return
    let cancelled = false
    getDataset(filter.datasetId)
      .then((dataset) => {
        if (!cancelled) {
          setNameLoad({ key: filter.datasetId, name: dataset.table_name ?? null })
        }
      })
      .catch(() => {
        if (!cancelled) setNameLoad({ key: filter.datasetId, name: null })
      })
    return () => {
      cancelled = true
    }
  }, [filter.datasetId, nameLoad?.key])

  const datasetName =
    nameLoad?.key === filter.datasetId ? nameLoad.name : null

  const isArrayValue = filter.operator === "in" || filter.operator === "between"

  return (
    <Section title="Filtro">
      <div className="space-y-2 text-xs">
        <p className="text-muted-foreground">
          Dataset:{" "}
          <span className="font-medium text-foreground">
            {datasetName ?? `Dataset #${filter.datasetId}`}
          </span>
        </p>
        <p className="text-muted-foreground">
          Coluna: <span className="font-mono text-foreground">{filter.column}</span>
        </p>
        <p className="text-muted-foreground">
          Operador: <span className="text-foreground">{filter.operator}</span>
          {" · "}
          {linkedCards} {linkedCards === 1 ? "cartão vinculado" : "cartões vinculados"}
        </p>
      </div>
      <Field label="Tipo de controle">
        <select
          className={SELECT_CLASS}
          value={filter.controlType ?? "dropdown"}
          onChange={(event) => {
            // Tipo e operador andam juntos (multi-select ↔ in etc.) e o
            // valor padrão é re-coerido para a forma do novo operador.
            const controlType = event.target
              .value as NonNullable<DashboardFilter["controlType"]>
            const operator = operatorForControlType(controlType)
            onSave({
              controlType,
              operator,
              defaultValue: coerceFilterValue(operator, filter.defaultValue),
            })
          }}
        >
          <option value="dropdown">Lista suspensa</option>
          <option value="multi-select">Seleção múltipla</option>
          <option value="list">Lista de opções</option>
          <option value="date-range">Intervalo de datas</option>
        </select>
      </Field>
      <Field label="Valor padrão">
        {filter.operator === "between" ? (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              className="h-8 text-xs"
              value={Array.isArray(filter.defaultValue) ? filter.defaultValue[0] ?? "" : ""}
              onChange={(event) =>
                onSave({
                  defaultValue: [
                    event.target.value,
                    Array.isArray(filter.defaultValue) ? filter.defaultValue[1] ?? "" : "",
                  ],
                })
              }
            />
            <span className="text-xs text-muted-foreground">até</span>
            <Input
              type="date"
              className="h-8 text-xs"
              value={Array.isArray(filter.defaultValue) ? filter.defaultValue[1] ?? "" : ""}
              onChange={(event) =>
                onSave({
                  defaultValue: [
                    Array.isArray(filter.defaultValue) ? filter.defaultValue[0] ?? "" : "",
                    event.target.value,
                  ],
                })
              }
            />
          </div>
        ) : filter.operator === "gte" || filter.operator === "lte" ? (
          <Input
            type="date"
            className="h-8 text-xs"
            value={typeof filter.defaultValue === "string" ? filter.defaultValue : ""}
            onChange={(event) => onSave({ defaultValue: event.target.value })}
          />
        ) : (
          <Input
            className="h-8 text-xs"
            placeholder={isArrayValue ? "Valores separados por vírgula" : "Valor padrão (vazio = todos)"}
            value={
              Array.isArray(filter.defaultValue)
                ? filter.defaultValue.join(", ")
                : filter.defaultValue
            }
            onChange={(event) =>
              onSave({
                defaultValue: isArrayValue
                  ? event.target.value.split(",").map((v) => v.trim()).filter(Boolean)
                  : event.target.value,
              })
            }
          />
        )}
      </Field>
      <div className="space-y-2">
        <span className="text-xs font-medium text-muted-foreground">Escopo</span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={filter.scope === "dashboard" ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => onSave({ scope: "dashboard" })}
          >
            Página toda
          </Button>
          <Button
            type="button"
            variant={filter.scope === "dashboard" ? "outline" : "default"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => onSave({ scope: [] })}
          >
            Análises específicas
          </Button>
        </div>
        {filter.scope !== "dashboard" && (
          <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
            {scopeOptions.map((option) => (
              <label
                key={option.id}
                className="flex cursor-pointer items-center gap-2 text-xs text-foreground"
              >
                <input
                  type="checkbox"
                  className="rounded border-border"
                  checked={filter.scope !== "dashboard" && filter.scope.includes(option.id)}
                  onChange={(event) => {
                    const current = filter.scope === "dashboard" ? [] : [...filter.scope]
                    onSave({
                      scope: event.target.checked
                        ? [...current, option.id]
                        : current.filter((id) => id !== option.id),
                    })
                  }}
                />
                <span className="truncate">{option.name}</span>
              </label>
            ))}
            {scopeOptions.length === 0 && (
              <p className="py-2 text-center text-xs text-muted-foreground">
                Nenhuma análise neste painel.
              </p>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          Seleção atual:{" "}
          {Array.isArray(runtimeValue)
            ? runtimeValue.join(", ") || "—"
            : runtimeValue || "—"}
        </span>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClearValue}>
          Limpar seleção
        </Button>
      </div>
    </Section>
  )
}

function ChartSection({
  widget,
  onSave,
}: {
  widget: DashboardWidget
  onSave: (config: WidgetConfig) => void
}) {
  const analysisId = widget.analysisId
  const expectedKey = analysisId ?? "static"
  const [load, setLoad] = useState<{
    key: string
    analysis: Analysis | null
    columns: DatasetColumn[]
  } | null>(null)

  useEffect(() => {
    if (load?.key === expectedKey || expectedKey === "static") return
    let cancelled = false
    void (async () => {
      try {
        const analysis = await getAnalysis(expectedKey)
        let columns: DatasetColumn[] = []
        if (analysis?.datasetId != null) {
          try {
            const dataset = await getDataset(analysis.datasetId)
            columns = dataset.columns ?? []
          } catch {
            columns = []
          }
        }
        if (!cancelled) setLoad({ key: expectedKey, analysis, columns })
      } catch {
        if (!cancelled) setLoad({ key: expectedKey, analysis: null, columns: [] })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [expectedKey, load?.key])

  const effectiveLoad =
    load?.key === expectedKey
      ? load
      : expectedKey === "static"
        ? { key: "static", analysis: null as Analysis | null, columns: [] as DatasetColumn[] }
        : null
  const ready = effectiveLoad !== null
  const baseConfig =
    widget.config ??
    (effectiveLoad?.analysis ? legacyToWidgetConfig(effectiveLoad.analysis) : null)

  return (
    <Section title="Dados e visualização">
      {!ready || !baseConfig ? (
        <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
          <Loader2 size={14} className="animate-spin" />
          Carregando configuração...
        </div>
      ) : (
        <ChartConfigPanel
          key={`${widget.id}-${widget.config ? "config" : "derived"}`}
          config={baseConfig}
          columns={effectiveLoad?.columns ?? []}
          onApply={onSave}
        />
      )}
    </Section>
  )
}

export interface DashboardPropertiesPanelProps {
  widget: DashboardWidget
  /** Geometria pixel do elemento no stage (editor livre). */
  pixel?: PixelRect
  /** Página do relatório — limites para clamp dos campos. */
  page?: CanvasPageLayout
  /** Todos os filtros do painel (para resolver o filtro do cartão). */
  filters: DashboardFilter[]
  /** Análises presentes no painel, para edição de escopo. */
  dashboardAnalysisIds: string[]
  linkedCards: number
  filterValues: Record<string, string | string[]>
  onSavePixelLayout?: (widgetId: string, pixel: PixelRect) => void
  onSaveConfig: (widgetId: string, config: WidgetConfig) => void
  onSaveFilter: (filterId: string, patch: Partial<DashboardFilter>) => void
  onClearFilterValue: (filterId: string) => void
  onBringToFront: (widgetId: string) => void
  onSendToBack: (widgetId: string) => void
  onRemoveWidget: (widgetId: string) => void
  onChangeLayer?: (widgetId: string, layer: "background" | "data" | "foreground") => void
  onAlignToPage?: (widgetId: string, edge: PageAlignEdge) => void
  currentLayer?: "background" | "data" | "foreground"
  /** Volta para a aba Biblioteca sem perder a seleção. */
  onClose: () => void
  className?: string
}

const TYPE_LABELS: Record<string, string> = {
  filter: "Filtro",
  text: "Texto",
  image: "Imagem",
  shape: "Forma",
  table: "Tabela",
  kpi: "KPI",
  "custom-html": "Personalizado",
}

export function DashboardPropertiesPanel({
  widget,
  pixel,
  page,
  filters,
  dashboardAnalysisIds,
  linkedCards,
  filterValues,
  onSavePixelLayout,
  onSaveConfig,
  onSaveFilter,
  onClearFilterValue,
  onBringToFront,
  onSendToBack,
  onRemoveWidget,
  onChangeLayer,
  onAlignToPage,
  currentLayer,
  onClose,
  className,
}: DashboardPropertiesPanelProps) {
  const [scopeOptions, setScopeOptions] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    if (widget.config?.type !== "filter") return
    let cancelled = false
    getAnalyses()
      .then((list) => {
        if (cancelled) return
        const wanted = new Set(dashboardAnalysisIds)
        const options = list
          .filter((a) => wanted.has(a.id))
          .map((a) => ({ id: a.id, name: a.name }))
        // Análises que saíram do catálogo ainda aparecem pelo id.
        for (const id of dashboardAnalysisIds) {
          if (!options.some((o) => o.id === id)) options.push({ id, name: id })
        }
        setScopeOptions(options)
      })
      .catch(() => {
        if (!cancelled) {
          setScopeOptions(dashboardAnalysisIds.map((id) => ({ id, name: id })))
        }
      })
    return () => {
      cancelled = true
    }
  }, [widget.id, widget.config?.type, dashboardAnalysisIds])

  const config = widget.config
  const filter =
    config?.type === "filter"
      ? filters.find((f) => f.id === config.filterId) ?? null
      : null
  const typeLabel = config
    ? (TYPE_LABELS[config.type] ?? (isChartWidgetConfig(config) ? "Gráfico" : config.type))
    : "Widget"

  function handleSaveConfig(next: WidgetConfig) {
    try {
      onSaveConfig(widget.id, normalizeWidgetConfig(next))
    } catch {
      // Valores vindos de inputs controlados já são válidos; o
      // normalizador é a rede de segurança final.
    }
  }

  return (
    <aside
      aria-label="Propriedades do elemento selecionado"
      className={cn(
        "flex flex-col w-full h-full shrink-0 bg-card",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3.5 bg-muted/50/70">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/30">
            <Settings2 size={15} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground leading-none">
              Propriedades
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {typeLabel}
              {config?.title ? ` · ${config.title}` : ""}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
          onClick={onClose}
          title="Voltar para a biblioteca"
        >
          <X size={15} />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {/* Conteúdo */}
        {config?.type === "filter" &&
          (filter ? (
            <FilterSection
              filter={filter}
              linkedCards={linkedCards}
              scopeOptions={scopeOptions}
              runtimeValue={filterValues[filter.id] ?? filter.defaultValue}
              onSave={(patch) => onSaveFilter(filter.id, patch)}
              onClearValue={() => onClearFilterValue(filter.id)}
            />
          ) : (
            <Section title="Filtro">
              <p className="text-xs text-muted-foreground">
                O filtro vinculado a este cartão foi excluído. Remova o cartão
                ou vincule-o novamente pela barra de filtros.
              </p>
            </Section>
          ))}

        {config?.type === "custom-html" && (
          <Section title="Conteúdo personalizado">
            <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
              Conteúdo HTML/CSS restrito ainda não está habilitado. Nenhum
              conteúdo é executado nesta etapa.
            </p>
          </Section>
        )}

        {config &&
          config.type !== "filter" &&
          config.type !== "custom-html" && (
            <ChartSection widget={widget} onSave={(next) => handleSaveConfig(next)} />
          )}

        {!config && (
          <Section title="Dados e visualização">
            <p className="text-xs text-muted-foreground">
              Widget legado sem configuração explícita. Use “Configurar” no
              menu do cartão para definir tipo e campos.
            </p>
          </Section>
        )}

        {/* Aparência */}
        {config && (
          <StyleSection config={config} onSave={handleSaveConfig} />
        )}

        {/* Dimensões e posicionamento (pixels do stage) */}
        <LayoutSection
          pixel={pixel}
          page={page}
          onSave={(rect) => onSavePixelLayout?.(widget.id, rect)}
        />

        {/* Alinhamento à página */}
        {onAlignToPage && (
          <AlignSection onAlign={(edge) => onAlignToPage(widget.id, edge)} />
        )}

        {/* Camadas */}
        {config && (
          <LayerSection
            onBringToFront={() => onBringToFront(widget.id)}
            onSendToBack={() => onSendToBack(widget.id)}
            onChangeLayer={onChangeLayer ? (layer) => onChangeLayer(widget.id, layer) : undefined}
            currentLayer={currentLayer}
          />
        )}

        <div className="px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            className="w-full text-destructive hover:text-destructive"
            onClick={() => onRemoveWidget(widget.id)}
          >
            <Trash2 size={14} />
            Excluir elemento
          </Button>
        </div>
      </div>
    </aside>
  )
}
