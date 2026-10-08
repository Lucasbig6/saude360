import { describe, expect, it } from "vitest"
import {
  buildPromptWithContext,
  displayQuestion,
  summarizeTurn,
} from "./chat-context"
import type { Investigation } from "@/hooks/use-explorer-agent"

function buildInvestigation(
  overrides: Partial<Investigation> = {}
): Investigation {
  return {
    id: "inv-1",
    question: "Quantos atendimentos houve?",
    datasetId: 12,
    datasetName: "demo",
    sessionId: "s1",
    insight: "",
    toolTrace: [],
    currentTool: null,
    queryData: null,
    sql: null,
    savedAnalysis: null,
    status: "done",
    error: null,
    pendingConfirmation: null,
    ...overrides,
  }
}

const QUERY_DATA = {
  columns: ["municipio", "total"],
  rows: [
    { municipio: "Recife", total: 80 },
    { municipio: "Olinda", total: 40 },
  ],
  rowCount: 2,
  truncated: false,
  executionMs: 10,
}

describe("summarizeTurn", () => {
  it("retorna nulo sem conteúdo", () => {
    expect(summarizeTurn(buildInvestigation())).toBeNull()
  })

  it("resume pergunta, SQL e amostra", () => {
    const summary = summarizeTurn(
      buildInvestigation({
        sql: "SELECT 1",
        queryData: QUERY_DATA,
      })
    )
    expect(summary).toContain("Quantos atendimentos houve?")
    expect(summary).toContain("SELECT 1")
    expect(summary).toContain("2 linha(s)")
    expect(summary).toContain("municipio=Recife")
  })
})

describe("buildPromptWithContext", () => {
  it("retorna a pergunta pura sem turnos anteriores", () => {
    expect(buildPromptWithContext("E agora?", [])).toBe("E agora?")
  })

  it("ignora turnos sem resultado ou com erro", () => {
    const previous = [
      buildInvestigation({ id: "a", status: "error", error: "x" }),
      buildInvestigation({ id: "b", status: "streaming" }),
    ]
    expect(buildPromptWithContext("E agora?", previous)).toBe("E agora?")
  })

  it("prefixa contexto dos últimos turnos com resultado", () => {
    const previous = [
      buildInvestigation({ id: "a", sql: "SELECT 1", queryData: QUERY_DATA }),
      buildInvestigation({
        id: "b",
        question: "E por faixa?",
        sql: "SELECT 2",
        queryData: QUERY_DATA,
      }),
    ]
    const prompt = buildPromptWithContext("Agora separa por município", previous)
    expect(prompt).toContain("Contexto da conversa")
    expect(prompt).toContain("SELECT 1")
    expect(prompt).toContain("E por faixa?")
    expect(prompt).toContain("Pergunta atual: Agora separa por município")
    expect(prompt.length).toBeLessThanOrEqual(6000)
  })

  it("descarta turnos antigos até caber no limite", () => {
    const big = "x".repeat(5900)
    const previous = [
      buildInvestigation({
        id: "a",
        sql: big,
        queryData: { ...QUERY_DATA, rows: [{ municipio: big, total: 1 }] },
      }),
      buildInvestigation({ id: "b", sql: "SELECT 2", queryData: QUERY_DATA }),
    ]
    const prompt = buildPromptWithContext("E agora?", previous)
    expect(prompt).toContain("SELECT 2")
    expect(prompt).not.toContain(big)
    expect(prompt.length).toBeLessThanOrEqual(6000)
  })
})

describe("displayQuestion", () => {
  it("remove o bloco de contexto injetado", () => {
    const prompt = buildPromptWithContext("E agora?", [
      buildInvestigation({ sql: "SELECT 1", queryData: QUERY_DATA }),
    ])
    expect(displayQuestion(prompt)).toBe("E agora?")
  })

  it("devolve intacta a pergunta sem contexto", () => {
    expect(displayQuestion("Pergunta simples")).toBe("Pergunta simples")
  })
})
