import type { AggregationFunction, ChartConfig } from "./chart-config"

export type Row = Record<string, unknown>

export interface PreparedSeries {
  name: string
  data: Array<number | null>
}

export interface PreparedPoint {
  x: number
  y: number | null
  name: string
  size: number | null
}

export interface PreparedCell {
  x: number
  y: number
  value: number
}

export interface PreparedNode {
  name: string
  value: number
  children?: PreparedNode[]
}

export interface PreparedData {
  categories: string[]
  series: PreparedSeries[]
  points: PreparedPoint[]
  cells: PreparedCell[]
  nodes: PreparedNode[]
  value: number | null
  rows: Row[]
}

export function toNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export function toLabel(value: unknown): string {
  if (value === null || value === undefined) {
    return ""
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  return String(value)
}

function dimensionFields(config: ChartConfig): string[] {
  const aggregationField = config.aggregation?.field
  const fields: string[] = []
  const xField = config.encoding?.x
  const groupField = config.encoding?.color ?? config.encoding?.series

  if (xField && xField !== aggregationField) {
    fields.push(xField)
  }
  if (groupField && groupField !== aggregationField && !fields.includes(groupField)) {
    fields.push(groupField)
  }
  return fields
}

function aggregateValues(
  values: unknown[],
  fn: AggregationFunction,
  rowCount: number,
): number | null {
  if (fn === "count") {
    return rowCount
  }
  const numbers = values
    .map(toNumber)
    .filter((value): value is number => value !== null)

  if (numbers.length === 0) {
    return null
  }

  switch (fn) {
    case "sum":
      return numbers.reduce((total, value) => total + value, 0)
    case "avg":
      return numbers.reduce((total, value) => total + value, 0) / numbers.length
    case "min":
      return Math.min(...numbers)
    case "max":
      return Math.max(...numbers)
    default:
      return null
  }
}

function applyAggregation(rows: Row[], config: ChartConfig): Row[] {
  const aggregation = config.aggregation
  if (!aggregation) {
    return rows
  }

  const fields = dimensionFields(config)

  if (fields.length === 0) {
    return [
      {
        [aggregation.field]: aggregateValues(
          rows.map((row) => row[aggregation.field]),
          aggregation.function,
          rows.length,
        ),
      },
    ]
  }

  const groups = new Map<string, Row[]>()
  for (const row of rows) {
    const key = fields.map((field) => toLabel(row[field])).join("\u0000")
    const bucket = groups.get(key)
    if (bucket) {
      bucket.push(row)
    } else {
      groups.set(key, [row])
    }
  }

  const result: Row[] = []
  for (const members of groups.values()) {
    const out: Row = {}
    for (const field of fields) {
      out[field] = members[0][field]
    }
    out[aggregation.field] = aggregateValues(
      members.map((row) => row[aggregation.field]),
      aggregation.function,
      members.length,
    )
    result.push(out)
  }
  return result
}

function compareValues(a: unknown, b: unknown): number {
  const na = toNumber(a)
  const nb = toNumber(b)
  if (na !== null && nb !== null) {
    return na - nb
  }
  if (na !== null) {
    return -1
  }
  if (nb !== null) {
    return 1
  }
  return toLabel(a).localeCompare(toLabel(b))
}

function applySort(rows: Row[], config: ChartConfig): Row[] {
  const sort = config.sort
  if (!sort) {
    return rows
  }
  const factor = sort.direction === "desc" ? -1 : 1
  return [...rows].sort((a, b) => compareValues(a[sort.field], b[sort.field]) * factor)
}

function applyLimit(rows: Row[], config: ChartConfig): Row[] {
  if (!config.limit || config.limit >= rows.length) {
    return rows
  }
  return rows.slice(0, config.limit)
}

function sumAt(series: PreparedSeries[], index: number): number {
  let total = 0
  for (const item of series) {
    total += item.data[index] ?? 0
  }
  return total
}

export function prepareData(rows: Row[], config: ChartConfig): PreparedData {
  const ordered = applyLimit(applySort(applyAggregation(rows, config), config), config)

  const xField = config.encoding?.x
  const yField = config.encoding?.y
  const groupField = config.encoding?.color ?? config.encoding?.series
  const sizeField = config.encoding?.size
  const measureField = config.aggregation?.field ?? yField

  const categories: string[] = []
  const categoryIndex = new Map<string, number>()
  for (const [position, row] of ordered.entries()) {
    const key = xField ? toLabel(row[xField]) : String(position + 1)
    if (!categoryIndex.has(key)) {
      categoryIndex.set(key, categories.length)
      categories.push(key)
    }
  }

  const groupNames = groupField
    ? [...new Set(ordered.map((row) => toLabel(row[groupField])))]
    : []
  const seriesNames = groupNames.length > 0 ? groupNames : [measureField ?? "Valor"]

  const series: PreparedSeries[] = seriesNames.map((name) => ({
    name,
    data: categories.map(() => null as number | null),
  }))

  for (const [position, row] of ordered.entries()) {
    const key = xField ? toLabel(row[xField]) : String(position + 1)
    const target = categoryIndex.get(key) ?? 0
    const value = measureField ? toNumber(row[measureField]) : null

    let slot = 0
    if (groupField) {
      slot = Math.max(0, groupNames.indexOf(toLabel(row[groupField])))
    }
    if (series[slot]) {
      series[slot].data[target] = value
    }
  }

  const points: PreparedPoint[] = ordered.map((row, position) => {
    const label = xField ? toLabel(row[xField]) : String(position + 1)
    const rawX = xField ? toNumber(row[xField]) : position + 1
    return {
      x: rawX ?? position + 1,
      y: measureField ? toNumber(row[measureField]) : null,
      name: label,
      size: sizeField ? toNumber(row[sizeField]) : null,
    }
  })

  const cells: PreparedCell[] = []
  for (const [position, row] of ordered.entries()) {
    const key = xField ? toLabel(row[xField]) : String(position + 1)
    const x = categoryIndex.get(key) ?? 0
    const y = groupField ? Math.max(0, groupNames.indexOf(toLabel(row[groupField]))) : 0
    const value = measureField ? toNumber(row[measureField]) : null
    if (value !== null) {
      cells.push({ x, y, value })
    }
  }

  const flatNodes: PreparedNode[] = categories.map((name, index) => ({
    name,
    value: sumAt(series, index),
  }))

  let nodes: PreparedNode[]
  if (groupField) {
    nodes = series.map((item) => {
      const children = categories.map((name, index) => ({
        name,
        value: item.data[index] ?? 0,
      }))
      return {
        name: item.name,
        children,
        value: children.reduce((total, child) => total + child.value, 0),
      }
    })
  } else {
    nodes = flatNodes
  }

  const measured = ordered
    .map((row) => (measureField ? toNumber(row[measureField]) : null))
    .filter((value): value is number => value !== null)

  const value =
    measured.length === 0
      ? null
      : measured.length === 1
        ? measured[0]
        : measured.reduce((total, item) => total + item, 0)

  return {
    categories,
    series,
    points,
    cells,
    nodes,
    value,
    rows: ordered,
  }
}
