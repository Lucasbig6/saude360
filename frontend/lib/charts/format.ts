import type { ChartNumberFormat } from "./chart-config"

const FORMATTERS: Record<ChartNumberFormat, Intl.NumberFormat> = {
  number: new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }),
  currency: new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }),
  percent: new Intl.NumberFormat("pt-BR", {
    style: "percent",
    maximumFractionDigits: 1,
  }),
  compact: new Intl.NumberFormat("pt-BR", { notation: "compact" }),
}

/**
 * Formata um valor para eixos, tooltips e data labels. Valores não numéricos
 * (datas, strings) são devolvidos como estão.
 */
export function formatChartValue(
  value: unknown,
  format: ChartNumberFormat = "number"
): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return FORMATTERS[format].format(value)
  }
  if (typeof value === "string") {
    const parsed = Number(value)
    if (value.trim() !== "" && Number.isFinite(parsed)) {
      return FORMATTERS[format].format(parsed)
    }
    return value
  }
  if (value === null || value === undefined) {
    return "—"
  }
  return String(value)
}

/** Formatter estilo ECharts: recebe string|number e devolve string. */
export function echartsValueFormatter(
  format: ChartNumberFormat = "number"
): (value: unknown) => string {
  return (value) => formatChartValue(value, format)
}
