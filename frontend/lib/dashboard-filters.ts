import type { DashboardFilter, FilterControlType } from "@/lib/types/dashboard"

type FilterOperator = DashboardFilter["operator"]

/**
 * Regras canônicas entre o tipo de controle (UI) e o operador (cláusula SQL).
 * Manter os dois em sincronia evita combinações inválidas como
 * `multi-select` + `eq`, em que o backend aplicaria só o primeiro valor.
 */
export function operatorForControlType(
  controlType: NonNullable<FilterControlType>
): FilterOperator {
  if (controlType === "multi-select") return "in"
  if (controlType === "date-range") return "between"
  return "eq"
}

/** Ajusta o controle quando o operador muda, preservando quando for seguro. */
export function controlTypeForOperator(
  operator: FilterOperator,
  current: NonNullable<FilterControlType>
): NonNullable<FilterControlType> {
  if (operator === "in") return "multi-select"
  if (operator === "between") return "date-range"
  if (operator === "eq") {
    return current === "multi-select" || current === "date-range"
      ? "dropdown"
      : current
  }
  // gte/lte: seleção múltipla não faz sentido; os demais rendem data.
  return current === "multi-select" ? "dropdown" : current
}

/**
 * Forma do valor padrão para o operador: `in` vive em array, `between`
 * precisa de dois elementos e os demais são string.
 */
export function coerceFilterValue(
  operator: FilterOperator,
  value: string | string[]
): string | string[] {
  if (operator === "in") {
    return Array.isArray(value) ? value : value ? [value] : []
  }
  if (operator === "between") {
    const items = Array.isArray(value) ? value : value ? [value] : []
    return [items[0] ?? "", items[1] ?? ""]
  }
  return Array.isArray(value) ? value[0] ?? "" : value
}
