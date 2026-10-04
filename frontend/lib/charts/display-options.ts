import type {
  ChartConfig,
  ChartLegendPosition,
  ChartNumberFormat,
} from "./chart-config"

/**
 * Opções de apresentação do gráfico editadas na aba Rótulos/Estilo do
 * Explorer. Espeta os campos de `ChartConfig` que são puro presentation —
 * separado do módulo de componentes para ser usado por painéis e páginas.
 */
export interface ChartDisplayOptions {
  title: string
  xAxisLabel: string
  yAxisLabel: string
  numberFormat: ChartNumberFormat
  showValues: boolean
  legend: boolean
  legendPosition: ChartLegendPosition
  palette: string
  /** Cores salvas fora do catálogo de paletas (análise restaurada). */
  colors: string[] | null
  stacked: boolean
  smooth: boolean
  sortField: string | null
  sortDirection: "asc" | "desc"
  limit: number | null
  exportable: boolean
}

export const DEFAULT_DISPLAY_OPTIONS: ChartDisplayOptions = {
  title: "",
  xAxisLabel: "",
  yAxisLabel: "",
  numberFormat: "number",
  showValues: false,
  legend: true,
  legendPosition: "bottom",
  palette: "auto",
  colors: null,
  stacked: false,
  smooth: false,
  sortField: null,
  sortDirection: "desc",
  limit: null,
  exportable: true,
}

export interface PalettePreset {
  id: string
  label: string
  colors: string[] | null
}

/** Paletas fechadas — `colors: null` mantém a paleta padrão do ECharts. */
export const PALETTES: PalettePreset[] = [
  { id: "auto", label: "Padrão", colors: null },
  {
    id: "teal",
    label: "Teal",
    colors: ["#0f766e", "#14b8a6", "#2dd4bf", "#5eead4", "#99f6e4", "#115e59"],
  },
  {
    id: "ocean",
    label: "Oceano",
    colors: ["#1d4ed8", "#3b82f6", "#60a5fa", "#93c5fd", "#bfdbfe", "#1e40af"],
  },
  {
    id: "sunset",
    label: "Pôr do sol",
    colors: ["#c2410c", "#ea580c", "#f97316", "#fb923c", "#fdba74", "#9a3412"],
  },
  {
    id: "forest",
    label: "Floresta",
    colors: ["#166534", "#15803d", "#22c55e", "#4ade80", "#86efac", "#14532d"],
  },
  {
    id: "grayscale",
    label: "Cinza",
    colors: ["#0f172a", "#334155", "#64748b", "#94a3b8", "#cbd5e1", "#475569"],
  },
]

export function paletteColors(id: string): string[] | undefined {
  return PALETTES.find((preset) => preset.id === id)?.colors ?? undefined
}

/**
 * Reconstrói as opções de apresentação a partir de uma `ChartConfig` salva.
 * Usado ao restaurar uma análise (Explorer e página da análise).
 */
export function chartConfigToDisplay(
  config: ChartConfig | null | undefined
): ChartDisplayOptions {
  if (!config) return DEFAULT_DISPLAY_OPTIONS
  return {
    ...DEFAULT_DISPLAY_OPTIONS,
    title: config.title ?? "",
    xAxisLabel: config.xAxisLabel ?? "",
    yAxisLabel: config.yAxisLabel ?? "",
    numberFormat: config.numberFormat ?? DEFAULT_DISPLAY_OPTIONS.numberFormat,
    showValues: config.showValues ?? false,
    legend: config.legend ?? true,
    legendPosition:
      config.legendPosition ?? DEFAULT_DISPLAY_OPTIONS.legendPosition,
    palette: DEFAULT_DISPLAY_OPTIONS.palette,
    colors: config.colors ?? null,
    stacked: config.stacked ?? false,
    smooth: config.smooth ?? false,
    sortField: config.sort?.field ?? null,
    sortDirection: config.sort?.direction ?? DEFAULT_DISPLAY_OPTIONS.sortDirection,
    limit: config.limit ?? null,
    exportable: config.exportable ?? false,
  }
}
