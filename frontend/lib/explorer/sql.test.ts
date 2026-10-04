import { describe, expect, it } from "vitest"
import {
  generatePreviewSql,
  looksLikeSql,
  quoteIdentifier,
} from "./sql"

describe("quoteIdentifier", () => {
  it("escapa aspas duplas do identificador", () => {
    expect(quoteIdentifier('tabela"x')).toBe('"tabela""x"')
  })
})

describe("generatePreviewSql", () => {
  it("gera SELECT com LIMIT para a tabela informada", () => {
    expect(generatePreviewSql("demo_atendimentos")).toBe(
      'SELECT *\nFROM "demo_atendimentos"\nLIMIT 100'
    )
  })

  it("rejeita nome vazio", () => {
    expect(() => generatePreviewSql("  ")).toThrow()
  })
})

describe("looksLikeSql", () => {
  it("reconhece SELECT e WITH, com espaços iniciais", () => {
    expect(looksLikeSql("SELECT * FROM t")).toBe(true)
    expect(looksLikeSql("  with cte as (select 1) select * from cte")).toBe(true)
  })

  it("não trata linguagem natural como SQL", () => {
    expect(looksLikeSql("Como evoluíram os atendimentos?")).toBe(false)
    expect(looksLikeSql("mostra o total por município")).toBe(false)
    expect(looksLikeSql("SHOW TABLES")).toBe(false)
  })
})
