export interface InsightStat {
  /** Valor em destaque (ex.: "↑ 5,8%", "MARÇO", "8.888"). */
  value: string
  /** Rótulo explicativo (ex.: "crescimento no período"). */
  label: string
}

const numberFormat = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
})

const percentFormat = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1,
})

function formatCell(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return numberFormat.format(value)
  }
  if (value === null || value === undefined) return "—"
  return String(value)
}

/**
 * Estatísticas determinísticas sobre o resultado tabular para o bloco
 * INSIGHTS: crescimento (último vs. primeiro da métrica), categoria de
 * maior valor e último valor. Sem par dimensão/métrica válido, resume
 * volume (linhas × colunas). Puro e testável — sem LLM.
 */
export function computeInsightStats(
  rows: Record<string, unknown>[],
  dimension: string | null,
  metric: string | null
): InsightStat[] {
  if (rows.length === 0) return []

  const columnCount = Object.keys(rows[0] ?? {}).length
  const metricValues =
    metric != null
      ? rows
          .map((row) => row[metric])
          .filter(
            (value): value is number =>
              typeof value === "number" && Number.isFinite(value)
          )
      : []

  if (metric == null || metricValues.length === 0) {
    return [
      {
        value: numberFormat.format(rows.length),
        label:
          rows.length === 1
            ? "linha retornada"
            : "linhas retornadas",
      },
      {
        value: numberFormat.format(columnCount),
        label: columnCount === 1 ? "coluna" : "colunas",
      },
    ]
  }

  const stats: InsightStat[] = []
  const total = metricValues.reduce((sum, value) => sum + value, 0)

  // Crescimento entre o primeiro e o último ponto da série.
  const first = metricValues[0]
  const last = metricValues[metricValues.length - 1]
  if (metricValues.length >= 2 && first !== 0) {
    const growth = (last - first) / Math.abs(first)
    const arrow = growth > 0 ? "↑ " : growth < 0 ? "↓ " : ""
    stats.push({
      value: `${arrow}${percentFormat.format(growth)}`,
      label: "variação no período",
    })
  }

  // Categoria de maior valor da métrica.
  if (dimension != null) {
    let peakRow = rows[0]
    let peakValue = Number.NEGATIVE_INFINITY
    for (const row of rows) {
      const value = row[metric]
      if (typeof value === "number" && Number.isFinite(value) && value > peakValue) {
        peakValue = value
        peakRow = row
      }
    }
    if (Number.isFinite(peakValue)) {
      stats.push({
        value: String(peakRow[dimension] ?? "—").toUpperCase(),
        label: `maior ${metric} (${formatCell(peakValue)})`,
      })
    }
  }

  stats.push({
    value: formatCell(last),
    label:
      dimension != null
        ? `${metric} · ${String(rows[rows.length - 1][dimension] ?? "atual")}`
        : `total ${metric}`,
  })

  if (stats.length === 1) {
    stats.unshift({ value: formatCell(total), label: `total ${metric}` });
  }

  return stats.slice(0, 3)
}
