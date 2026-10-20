import { describe, expect, it } from "vitest"
import {
  coerceFilterValue,
  controlTypeForOperator,
  operatorForControlType,
} from "./dashboard-filters"

describe("sincronia operador ↔ tipo de controle", () => {
  it("deriva o operador canônico do tipo de controle", () => {
    expect(operatorForControlType("dropdown")).toBe("eq")
    expect(operatorForControlType("list")).toBe("eq")
    expect(operatorForControlType("multi-select")).toBe("in")
    expect(operatorForControlType("date-range")).toBe("between")
  })

  it("ajusta o controle quando o operador muda, preservando quando seguro", () => {
    expect(controlTypeForOperator("in", "dropdown")).toBe("multi-select")
    expect(controlTypeForOperator("between", "list")).toBe("date-range")
    expect(controlTypeForOperator("eq", "list")).toBe("list")
    expect(controlTypeForOperator("eq", "multi-select")).toBe("dropdown")
    expect(controlTypeForOperator("eq", "date-range")).toBe("dropdown")
    expect(controlTypeForOperator("gte", "date-range")).toBe("date-range")
    expect(controlTypeForOperator("gte", "multi-select")).toBe("dropdown")
  })

  it("coerce o valor padrão para a forma do operador", () => {
    expect(coerceFilterValue("in", "SP")).toEqual(["SP"])
    expect(coerceFilterValue("in", [])).toEqual([])
    expect(coerceFilterValue("between", ["2024-01-01"])).toEqual([
      "2024-01-01",
      "",
    ])
    expect(coerceFilterValue("eq", ["SP", "RJ"])).toBe("SP")
    expect(coerceFilterValue("gte", "2024-01-01")).toBe("2024-01-01")
  })
})
