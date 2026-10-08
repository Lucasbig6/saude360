export type ColumnType = "numeric" | "categorical"

export interface ColumnInfo {
  name: string
  type: ColumnType
}

export function analyzeColumns(
  data: Record<string, unknown>[]
): ColumnInfo[] {
  const sample = data.slice(0, 100)
  const columnNames = Array.from(
    new Set(sample.flatMap((row) => Object.keys(row)))
  )

  return columnNames.map((name) => {
    const values = sample
      .map((row) => row[name])
      .filter((value) => value !== null && value !== undefined)

    if (values.length === 0 || values.every((value) => typeof value === "number")) {
      return { name, type: values.length === 0 ? "categorical" : "numeric" }
    }

    return { name, type: "categorical" }
  })
}
