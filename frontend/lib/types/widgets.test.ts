import { describe, expect, it } from "vitest"
import {
  isChartWidgetConfig,
  isStaticWidgetType,
  kpiValue,
  legacyToWidgetConfig,
  normalizeWidgetConfig,
} from "@/lib/types/widgets"

describe("normalizeWidgetConfig", () => {
  it("normaliza configs de gráfico pelo normalizeChartConfig", () => {
    const config = normalizeWidgetConfig({
      type: "bar",
      encoding: { x: "municipio", y: "total" },
      limit: "10",
    })

    expect(config).toEqual({
      type: "bar",
      legend: true,
      tooltip: true,
      encoding: { x: "municipio", y: "total" },
      limit: 10,
    })
  })

  it("normaliza table com título e limit", () => {
    expect(
      normalizeWidgetConfig({ type: "table", title: "Detalhe", limit: "25" })
    ).toEqual({ type: "table", title: "Detalhe", limit: 25 })
  })

  it("descarta limit inválido de table", () => {
    expect(normalizeWidgetConfig({ type: "table", limit: 0 })).toEqual({
      type: "table",
    })
  })

  it("normaliza kpi preservando field e function", () => {
    expect(
      normalizeWidgetConfig({
        type: "kpi",
        title: "Total",
        field: "total",
        function: "avg",
      })
    ).toEqual({ type: "kpi", title: "Total", field: "total", function: "avg" })
  })

  it("normaliza text com conteúdo ausente como string vazia", () => {
    expect(normalizeWidgetConfig({ type: "text" })).toEqual({
      type: "text",
      content: "",
    })
    expect(
      normalizeWidgetConfig({ type: "text", content: "Olá", title: "Nota" })
    ).toEqual({ type: "text", content: "Olá", title: "Nota" })
  })

  it("normaliza image com src e alt", () => {
    expect(
      normalizeWidgetConfig({ type: "image", src: "/logo.png", alt: "Logo" })
    ).toEqual({ type: "image", src: "/logo.png", alt: "Logo" })
  })

  it("normaliza forma e propriedades visuais seguras", () => {
    expect(
      normalizeWidgetConfig({
        type: "shape",
        shape: "circle",
        fill: "#fff",
        style: {
          backgroundColor: "#112233",
          borderRadius: 12,
          opacity: 0.7,
          zIndex: 3,
          visible: true,
        },
      })
    ).toEqual({
      type: "shape",
      shape: "circle",
      fill: "#fff",
      style: {
        backgroundColor: "#112233",
        borderRadius: 12,
        opacity: 0.7,
        zIndex: 3,
        visible: true,
      },
    })
  })

  it("valida texto formatável e descarta cores CSS arbitrárias", () => {
    expect(
      normalizeWidgetConfig({
        type: "text",
        content: "Resumo",
        color: "url(javascript:alert(1))",
        fontSize: 120,
        alignment: "center",
        style: { backgroundColor: "red" },
      })
    ).toEqual({
      type: "text",
      content: "Resumo",
      fontSize: 72,
      alignment: "center",
    })
  })

  it("mantém filtro como widget posicionado por referência estável", () => {
    expect(
      normalizeWidgetConfig({
        type: "filter",
        filterId: "filter-1",
        style: { visible: false },
      })
    ).toEqual({ type: "filter", filterId: "filter-1", style: { visible: false } })
    expect(() => normalizeWidgetConfig({ type: "filter" })).toThrow("filterId inválido")
  })

  it("normaliza fontFamily da allowlist e descarta outras", () => {
    expect(
      normalizeWidgetConfig({
        type: "text",
        content: "Título",
        fontFamily: "Georgia",
      })
    ).toEqual({ type: "text", content: "Título", fontFamily: "Georgia" })
    expect(
      normalizeWidgetConfig({
        type: "text",
        content: "Título",
        fontFamily: "Comic Sans",
      })
    ).toEqual({ type: "text", content: "Título" })
  })

  it("normaliza objectPosition válido e descarta inválido", () => {
    expect(
      normalizeWidgetConfig({
        type: "image",
        src: "data:image/png;base64,aaa",
        objectPosition: "top left",
      })
    ).toEqual({
      type: "image",
      src: "data:image/png;base64,aaa",
      objectPosition: "top left",
    })
    expect(
      normalizeWidgetConfig({
        type: "image",
        src: "data:image/png;base64,aaa",
        objectPosition: "expression(alert(1))",
      })
    ).toEqual({ type: "image", src: "data:image/png;base64,aaa" })
  })

  it("normaliza custom-html válido com estilo", () => {
    expect(
      normalizeWidgetConfig({
        type: "custom-html",
        title: "Aviso",
        html: "<div class='aviso'>Manutenção</div>",
        css: ".aviso { color: #111; }",
        style: { opacity: 0.9 },
      })
    ).toEqual({
      type: "custom-html",
      title: "Aviso",
      html: "<div class='aviso'>Manutenção</div>",
      css: ".aviso { color: #111; }",
      style: { opacity: 0.9 },
    })
  })

  it("rejeita custom-html com script, handlers e javascript:", () => {
    for (const html of [
      "<script>alert(1)</script>",
      "<div onclick='x()'>oi</div>",
      "<a href='javascript:alert(1)'>x</a>",
      "<iframe src='https://exemplo.com'></iframe>",
    ]) {
      expect(() => normalizeWidgetConfig({ type: "custom-html", html })).toThrow(
        "conteúdo personalizado inválido"
      )
    }
    expect(() =>
      normalizeWidgetConfig({
        type: "custom-html",
        html: "<div>ok</div>",
        css: ".a { background: expression(alert(1)); }",
      })
    ).toThrow("conteúdo personalizado inválido")
  })

  it("rejeita custom-html acima do limite de tamanho", () => {
    expect(() =>
      normalizeWidgetConfig({ type: "custom-html", html: "x".repeat(20_001) })
    ).toThrow("limite de tamanho")
  })

  it("lança erro para entradas inválidas", () => {
    expect(() => normalizeWidgetConfig(null)).toThrow("WidgetConfig inválida")
    expect(() => normalizeWidgetConfig("bar")).toThrow("WidgetConfig inválida")
    expect(() => normalizeWidgetConfig([])).toThrow("WidgetConfig inválida")
    expect(() => normalizeWidgetConfig({ type: "sunburst" })).toThrow(
      "tipo de widget desconhecido"
    )
    expect(() => normalizeWidgetConfig({})).toThrow(
      "tipo de widget desconhecido"
    )
  })
})

describe("guards de tipo", () => {
  it("isStaticWidgetType cobre os tipos estáticos", () => {
    for (const type of ["table", "kpi", "text", "image", "shape"]) {
      expect(isStaticWidgetType(type)).toBe(true)
    }
    expect(isStaticWidgetType("bar")).toBe(false)
    expect(isStaticWidgetType(42)).toBe(false)
  })

  it("isChartWidgetConfig separa gráficos dos estáticos", () => {
    expect(isChartWidgetConfig({ type: "bar" })).toBe(true)
    expect(isChartWidgetConfig({ type: "table" })).toBe(false)
    expect(isChartWidgetConfig({ type: "kpi" })).toBe(false)
  })
})

describe("legacyToWidgetConfig", () => {
  it("tabela vira table", () => {
    expect(legacyToWidgetConfig({ chartType: "table" })).toEqual({
      type: "table",
    })
  })

  it("KPI legado vira widget agregado pelo campo de métrica", () => {
    expect(
      legacyToWidgetConfig({ chartType: "kpi", metric: "total" })
    ).toEqual({ type: "kpi", field: "total", function: "sum" })
  })

  it("mapa legado preserva os campos de longitude e latitude", () => {
    expect(
      legacyToWidgetConfig({
        chartType: "map",
        dimension: "longitude",
        metric: "latitude",
      })
    ).toMatchObject({
      type: "map",
      encoding: { x: "longitude", y: "latitude" },
    })
  })

  it("gráfico legado vira ChartConfig com encoding", () => {
    expect(
      legacyToWidgetConfig({
        chartType: "pie",
        dimension: "municipio",
        metric: "total",
      })
    ).toEqual({
      type: "pie",
      legend: true,
      tooltip: true,
      encoding: { x: "municipio", y: "total" },
    })
  })

  it("tipo desconhecido ou ausente vira bar", () => {
    expect(legacyToWidgetConfig({ chartType: "boxplot" })).toMatchObject({
      type: "bar",
    })
    expect(legacyToWidgetConfig({})).toMatchObject({ type: "bar" })
    expect(legacyToWidgetConfig({ chartType: null })).toMatchObject({
      type: "bar",
    })
  })
})

describe("kpiValue", () => {
  it("soma valores numéricos inclusive strings numéricas", () => {
    const value = kpiValue(
      [
        { total: 10 },
        { total: "20" },
        { total: null },
        { total: "abc" },
        { total: 5 },
      ],
      { type: "kpi", field: "total", function: "sum" }
    )
    expect(value).toBe(35)
  })

  it("calcula avg, min e max", () => {
    const rows = [{ total: 10 }, { total: 30 }, { total: 20 }]
    expect(kpiValue(rows, { type: "kpi", field: "total", function: "avg" })).toBe(20)
    expect(kpiValue(rows, { type: "kpi", field: "total", function: "min" })).toBe(10)
    expect(kpiValue(rows, { type: "kpi", field: "total", function: "max" })).toBe(30)
  })

  it("count ignora field e conta linhas", () => {
    const rows = [{ total: 10 }, { total: 30 }]
    expect(kpiValue(rows, { type: "kpi", function: "count" })).toBe(2)
    expect(kpiValue(rows, { type: "kpi", field: "total", function: "count" })).toBe(2)
  })

  it("sem field assume count", () => {
    expect(kpiValue([{ a: 1 }, { a: 2 }], { type: "kpi" })).toBe(2)
  })

  it("sem valores numéricos ou sem linhas devolve null", () => {
    expect(
      kpiValue([{ total: "abc" }, { total: null }], {
        type: "kpi",
        field: "total",
        function: "sum",
      })
    ).toBeNull()
    expect(
      kpiValue([], { type: "kpi", field: "total", function: "sum" })
    ).toBeNull()
  })
})
