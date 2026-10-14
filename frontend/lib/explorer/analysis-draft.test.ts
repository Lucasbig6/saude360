import { describe, expect, it } from "vitest"
import {
  analysisDraftReducer,
  configFromPresentation,
  createEmptyDraft,
  normalizePreviewConfig,
  workspaceFromDraft,
  type AnalysisDraft,
  type DraftAction,
  type DraftMeta,
  type PreviewConfig,
} from "./analysis-draft"
import type { ExplorerQueryData } from "@/hooks/use-explorer-agent"

const DATA: ExplorerQueryData = {
  columns: ["municipio", "total"],
  rows: [{ municipio: "Recife", total: 80 }],
  rowCount: 1,
  truncated: false,
  executionMs: 12,
}

const OTHER_DATA: ExplorerQueryData = {
  columns: ["municipio", "total"],
  rows: [{ municipio: "Olinda", total: 40 }],
  rowCount: 1,
  truncated: false,
}

function config(overrides: Partial<PreviewConfig> = {}): PreviewConfig {
  return {
    sql: "SELECT municipio, total FROM demo",
    chartType: "bar",
    dimension: "municipio",
    metric: "total",
    colorField: null,
    sort: null,
    limit: null,
    filters: [],
    showValues: null,
    ...overrides,
  }
}

function meta(overrides: Partial<DraftMeta> = {}): DraftMeta {
  return {
    source: "agent",
    databaseId: 1,
    dbSchema: "public",
    datasetId: 12,
    datasetName: "demo",
    question: "Total por município?",
    insight: "Recife lidera.",
    investigationId: "inv-1",
    ...overrides,
  }
}

function apply(state: AnalysisDraft, ...actions: DraftAction[]): AnalysisDraft {
  return actions.reduce(analysisDraftReducer, state)
}

describe("normalizePreviewConfig", () => {
  it("aceita a config completa do contrato", () => {
    const parsed = normalizePreviewConfig({
      sql: "SELECT 1",
      chartType: "line",
      dimension: "mes",
      metric: "total",
      colorField: "uf",
      sort: { field: "total", direction: "asc" },
      limit: 100,
      filters: [{ field: "uf", operator: "=", value: "PE" }],
      showValues: true,
    })
    expect(parsed).toEqual(config({
      sql: "SELECT 1",
      chartType: "line",
      dimension: "mes",
      metric: "total",
      colorField: "uf",
      sort: { field: "total", direction: "asc" },
      limit: 100,
      filters: [{ field: "uf", operator: "=", value: "PE" }],
      showValues: true,
    }))
  })

  it("rejeita sem SQL e normaliza campos inválidos em vez de derrubar a prévia", () => {
    expect(normalizePreviewConfig(null)).toBeNull()
    expect(normalizePreviewConfig({ chartType: "bar" })).toBeNull()
    expect(normalizePreviewConfig("SELECT 1")).toBeNull()

    const parsed = normalizePreviewConfig({
      sql: "SELECT 1",
      chartType: "chart-inexistente",
      dimension: "",
      metric: 42,
      sort: { field: "total", direction: "sideways" },
      limit: -5,
      showValues: "sim",
      filters: [
        "lixo",
        { field: "uf", operator: "=" },
        { operator: "=", value: "PE" },
      ],
    })
    expect(parsed).toMatchObject({
      sql: "SELECT 1",
      chartType: "bar",
      dimension: null,
      metric: null,
      sort: null,
      limit: null,
      showValues: null,
      // operador sem valor (ex.: IS NULL) é válido; entradas sem campo não.
      filters: [{ field: "uf", operator: "=" }],
    })
  })
})

describe("analysisDraftReducer — primeiro pedido popula a prévia", () => {
  it("aplica config e dados atômicos e ativa o modo gráfico", () => {
    const state = apply(createEmptyDraft(), {
      type: "preview",
      config: config(),
      data: DATA,
      meta: meta(),
    })

    expect(state.data).toEqual(DATA)
    expect(state.config).toEqual(config())
    expect(state.sql).toBe(config().sql)
    expect(state.presentation.chartType).toBe("bar")
    expect(state.presentation.dimension).toBe("municipio")
    expect(state.presentation.metric).toBe("total")
    expect(state.presentation.viewMode).toBe("chart")
    expect(state.executing).toBe(false)
    expect(state.error).toBeNull()
    expect(workspaceFromDraft(state)).toMatchObject({
      rows: DATA.rows,
      source: "agent",
      investigationId: "inv-1",
    })
  })

  it("resultado sem config re-sugere a visualização a partir das linhas", () => {
    const state = apply(createEmptyDraft(), {
      type: "result",
      data: {
        columns: ["mes", "total"],
        rows: [
          { mes: "2026-01", total: 10 },
          { mes: "2026-02", total: 20 },
        ],
        rowCount: 2,
        truncated: false,
      },
      sql: "SELECT mes, total FROM demo",
      meta: meta({ source: "sql" }),
    })

    expect(state.config).toBeNull()
    expect(state.presentation.dimension).toBe("mes")
    expect(state.presentation.metric).toBe("total")
    expect(state.presentation.viewMode).toBe("chart")
  })
})

describe("analysisDraftReducer — identidade preservada entre pedidos", () => {
  const restored = apply(createEmptyDraft(), {
    type: "restore",
    analysisId: "analysis-1",
    config: config({ colorField: "uf", limit: 50 }),
    presentation: configPresentation(),
    meta: meta({ source: "sql" }),
  })

  function configPresentation() {
    const state = apply(createEmptyDraft(), {
      type: "preview",
      config: config({ colorField: "uf", limit: 50 }),
      data: DATA,
      meta: meta(),
    })
    return state.presentation
  }

  it("segundo pedido modifica o tipo mantendo analysisId e dados novos", () => {
    const state = apply(restored, {
      type: "preview",
      config: config({ chartType: "line" }),
      data: OTHER_DATA,
      meta: meta(),
    })

    expect(state.analysisId).toBe("analysis-1")
    expect(state.presentation.chartType).toBe("line")
    expect(state.data).toEqual(OTHER_DATA)
    expect(state.config?.chartType).toBe("line")
  })

  it("campos que a nova config não define são preservados", () => {
    const withTitle = apply(restored, {
      type: "patch-presentation",
      presentation: {
        ...restored.presentation,
        display: {
          ...restored.presentation.display,
          title: "Meu título",
          showValues: true,
        },
      },
    })
    expect(withTitle.config?.chartType).toBe("bar")

    const next = apply(withTitle, {
      type: "preview",
      config: config({ sort: { field: "total", direction: "asc" } }),
      data: OTHER_DATA,
      meta: meta(),
    })

    expect(next.presentation.display.title).toBe("Meu título")
    expect(next.presentation.display.showValues).toBe(true)
    expect(next.presentation.display.sortField).toBe("total")
    expect(next.presentation.colorField).toBeNull()
    expect(next.presentation.display.limit).toBeNull()
    expect(next.analysisId).toBe("analysis-1")
  })

  it("analysisId sobrevive a saved idêntico sem duplicar", () => {
    const state = apply(restored, { type: "saved", analysisId: "analysis-1" })
    expect(state.analysisId).toBe("analysis-1")
    const other = apply(restored, { type: "saved", analysisId: "analysis-2" })
    expect(other.analysisId).toBe("analysis-2")
    expect(other.data).toEqual(restored.data)
  })
})

describe("analysisDraftReducer — robustez", () => {
  it("erro preserva a última visualização válida", () => {
    const state = apply(
      createEmptyDraft(),
      { type: "preview", config: config(), data: DATA, meta: meta() },
      { type: "error", message: "Falha na consulta." }
    )

    expect(state.error).toBe("Falha na consulta.")
    expect(state.executing).toBe(false)
    expect(state.data).toEqual(DATA)
    expect(state.config).toEqual(config())
    expect(state.presentation.viewMode).toBe("chart")
  })

  it("running marca execução e limpa erro; result conclui", () => {
    const failed = apply(
      createEmptyDraft(),
      { type: "preview", config: config(), data: DATA, meta: meta() },
      { type: "error", message: "x" }
    )
    const running = apply(failed, { type: "running" })
    expect(running.executing).toBe(true)
    expect(running.error).toBeNull()
    expect(running.data).toEqual(DATA)

    const done = apply(running, {
      type: "result",
      data: OTHER_DATA,
      sql: "SELECT 1",
      meta: meta({ source: "sql" }),
    })
    expect(done.executing).toBe(false)
    expect(done.data).toEqual(OTHER_DATA)
  })

  it("result reconcilia colunas: campo que sumiu é limpo em vez de quebrar o gráfico", () => {
    const withPreview = apply(createEmptyDraft(), {
      type: "preview",
      config: config({
        colorField: "uf",
        sort: { field: "total", direction: "desc" },
      }),
      data: DATA,
      meta: meta(),
    })
    expect(withPreview.presentation.dimension).toBe("municipio")

    const next = apply(withPreview, {
      type: "result",
      data: {
        columns: ["outro", "total"],
        rows: [{ outro: "x", total: 1 }],
        rowCount: 1,
        truncated: false,
      },
      sql: "SELECT outro, total FROM demo",
      meta: meta({ source: "sql" }),
    })

    expect(next.presentation.dimension).toBeNull()
    expect(next.presentation.colorField).toBeNull()
    expect(next.presentation.viewMode).toBe("table")
    expect(next.presentation.metric).toBe("total")
    expect(next.config?.dimension).toBeNull()
    expect(next.config?.sql).toBe("SELECT outro, total FROM demo")
  })

  it("patch-presentation espelha a apresentação na config", () => {
    const state = apply(
      createEmptyDraft(),
      { type: "preview", config: config(), data: DATA, meta: meta() },
      {
        type: "patch-presentation",
        presentation: {
          chartType: "kpi",
          dimension: null,
          metric: "total",
          colorField: null,
          display: {
            ...createEmptyDraft().presentation.display,
            limit: 10,
          },
          viewMode: "chart",
          filters: [{ field: "uf", operator: "=", value: "PE" }],
        },
      }
    )

    expect(state.config).toMatchObject({
      chartType: "kpi",
      metric: "total",
      limit: 10,
      filters: [{ field: "uf", operator: "=", value: "PE" }],
    })
    expect(state.config?.sql).toBe(config().sql)
  })

  it("meta faz merge sem perder identidade e ignora atualizações sem mudanças", () => {
    const base = apply(createEmptyDraft(), {
      type: "preview",
      config: config(),
      data: DATA,
      meta: meta(),
    })
    const merged = apply(base, {
      type: "meta",
      meta: { insight: "Nova explicação.", savedAnalysis: null },
    })
    expect(merged.meta?.question).toBe("Total por município?")
    expect(merged.meta?.investigationId).toBe("inv-1")
    expect(merged.meta?.insight).toBe("Nova explicação.")

    const same = apply(merged, {
      type: "meta",
      meta: { insight: "Nova explicação." },
    })
    expect(same).toBe(merged)
  })

  it("restore carrega configuração salva sem dados; reset volta ao início", () => {
    const restored = apply(createEmptyDraft(), {
      type: "restore",
      analysisId: "analysis-9",
      config: config({ chartType: "line" }),
      presentation: {
        chartType: "line",
        dimension: "municipio",
        metric: "total",
        colorField: null,
        display: createEmptyDraft().presentation.display,
        viewMode: "chart",
        filters: [{ field: "uf", operator: "=", value: "PE" }],
      },
      meta: meta({ source: "sql", question: "Análise salva" }),
    })

    expect(restored.analysisId).toBe("analysis-9")
    expect(restored.config?.chartType).toBe("line")
    expect(restored.data).toBeNull()
    expect(restored.meta?.question).toBe("Análise salva")
    expect(workspaceFromDraft(restored)).not.toBeNull()

    const reset = apply(restored, { type: "reset" })
    expect(reset).toEqual(createEmptyDraft())
    expect(workspaceFromDraft(reset)).toBeNull()
  })

  it("configFromPresentation reflete a apresentação controlada", () => {
    const state = apply(createEmptyDraft(), {
      type: "preview",
      config: config({ sort: { field: "total", direction: "asc" }, limit: 20 }),
      data: DATA,
      meta: meta(),
    })
    const derived = configFromPresentation(
      state.presentation,
      "SELECT 1"
    )
    expect(derived).toEqual({
      sql: "SELECT 1",
      chartType: "bar",
      dimension: "municipio",
      metric: "total",
      colorField: null,
      sort: { field: "total", direction: "asc" },
      limit: 20,
      filters: [],
      showValues: false,
    })
  })

  it("showValues liga/desliga rótulos e null mantém o atual", () => {
    const on = apply(createEmptyDraft(), {
      type: "preview",
      config: config({ showValues: true }),
      data: DATA,
      meta: meta(),
    })
    expect(on.presentation.display.showValues).toBe(true)
    expect(
      configFromPresentation(on.presentation, "SELECT 1").showValues
    ).toBe(true)

    const kept = apply(on, {
      type: "preview",
      config: config(),
      data: OTHER_DATA,
      meta: meta(),
    })
    expect(kept.presentation.display.showValues).toBe(true)

    const off = apply(kept, {
      type: "preview",
      config: config({ showValues: false }),
      data: OTHER_DATA,
      meta: meta(),
    })
    expect(off.presentation.display.showValues).toBe(false)
    expect(
      configFromPresentation(off.presentation, "SELECT 1").showValues
    ).toBe(false)
  })
})
