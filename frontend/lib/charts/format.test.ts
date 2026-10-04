import { describe, expect, it } from "vitest"
import {
  echartsValueFormatter,
  formatChartValue,
} from "@/lib/charts/format"

describe("formatChartValue", () => {
  it("formata números com o padrão pt-BR", () => {
    expect(formatChartValue(1234.567)).toBe("1.234,57")
    expect(formatChartValue(0)).toBe("0")
    expect(formatChartValue(-1000)).toBe("-1.000")
  })

  it("formata moeda em BRL", () => {
    expect(formatChartValue(1500.9, "currency")).toBe("R$\u00A01.500,90")
  })

  it("formata percentual com uma casa decimal", () => {
    expect(formatChartValue(0.1234, "percent")).toBe("12,3%")
    expect(formatChartValue(1, "percent")).toBe("100%")
  })

  it("formata de forma compacta", () => {
    expect(formatChartValue(1500, "compact")).toBe("1,5\u00A0mil")
    expect(formatChartValue(2_000_000, "compact")).toBe("2\u00A0mi")
  })

  it("converte strings numéricas e preserva textos", () => {
    expect(formatChartValue("1500", "number")).toBe("1.500")
    expect(formatChartValue("Teresina")).toBe("Teresina")
    expect(formatChartValue("  ")).toBe("  ")
  })

  it("usa travessão para nulos e converte o resto em string", () => {
    expect(formatChartValue(null)).toBe("—")
    expect(formatChartValue(undefined)).toBe("—")
    expect(formatChartValue(Number.NaN)).toBe("NaN")
    expect(formatChartValue(true)).toBe("true")
  })

  it("não formata números não finitos", () => {
    expect(formatChartValue(Number.POSITIVE_INFINITY)).toBe("Infinity")
  })
})

describe("echartsValueFormatter", () => {
  it("devolve uma função string -> string", () => {
    const formatter = echartsValueFormatter("currency")
    expect(formatter(10)).toBe("R$\u00A010,00")
    expect(echartsValueFormatter()(null)).toBe("—")
  })
})
