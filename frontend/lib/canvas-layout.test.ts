import { describe, expect, it } from "vitest"
import {
  applyCanvasOperation,
  geometryForCanvas,
  gridToPixelGeometry,
  layoutForWidgets,
  normalizeGridLayout,
  pixelToGridGeometry,
  readCanvasLayout,
  withPixelGeometry,
} from "./canvas-layout"
import type { DashboardWidget } from "@/lib/types/dashboard"

const widget = { id: "w", analysisId: null, layout: { x: 2, y: 1, w: 4, h: 3 } }
describe("canvas layout v2", () => {
  it("espelha a geometria da grade no documento e mantém a página padrão", () => { const document = layoutForWidgets([widget], ["p"]); expect(document.objects.w).toMatchObject({ x: 2, y: 1, w: 4, h: 3, visible: true, layer: "data" }); expect(document.pages.p).toMatchObject({ width: 1920, height: 1080 }) })
  it("preserva layer/zIndex existentes ao espelhar a grade", () => { const existing = layoutForWidgets([{ ...widget, config: { type: "bar" } }], ["p"]); const withLayer = applyCanvasOperation(existing, { type: "set-geometry", id: "w", geometry: { layer: "foreground", zIndex: 7 } }); const document = layoutForWidgets([{ ...widget, layout: { x: 5, y: 2, w: 6, h: 5 } }], ["p"], withLayer); expect(document.objects.w).toMatchObject({ x: 5, y: 2, w: 6, h: 5, layer: "foreground", zIndex: 7 }) })
  it("aceita apenas documento versionado e aplica operações previsíveis", () => { const document = layoutForWidgets([widget], ["p"]); const next = applyCanvasOperation(document, { type: "set-geometry", id: "w", geometry: { x: 9, w: 6 } }); expect(next.objects.w).toMatchObject({ x: 9, w: 6 }); expect(readCanvasLayout(next)).toEqual(next); expect(readCanvasLayout({ version: 1 })).toBeNull() })
})

describe("normalizeGridLayout", () => {
  it("mantém layout de grade intacto", () => { expect(normalizeGridLayout({ x: 0, y: 8, w: 6, h: 4 })).toEqual({ x: 0, y: 8, w: 6, h: 4 }) })
  it("repara coordenadas em pixels da era pixel/Konva", () => { expect(normalizeGridLayout({ x: 200, y: 80, w: 384, h: 224 })).toEqual({ x: 2, y: 1, w: 4, h: 3 }) })
  it("repara pixels digitados no painel de propriedades e limita às 12 colunas", () => { expect(normalizeGridLayout({ x: 500, y: 640, w: 1920, h: 304 })).toEqual({ x: 5, y: 8, w: 12, h: 4 }) })
})

describe("conversão grade <-> pixels", () => {
  it("converte unidades de grade para pixels na página padrão (1920: col 160px, linha 96px)", () => {
    expect(gridToPixelGeometry({ x: 2, y: 1, w: 4, h: 3 })).toEqual({
      x: 320,
      y: 96,
      w: 640,
      h: 288,
    })
  })

  it("converte pixels de volta para espelho de grade clampado", () => {
    expect(pixelToGridGeometry({ x: 320, y: 96, w: 640, h: 288 })).toEqual({
      x: 2,
      y: 1,
      w: 4,
      h: 3,
    })
  })

  it("clamp: x fora de 0–11, w mínimo 1 e y negativo", () => {
    expect(pixelToGridGeometry({ x: 99999, y: -20, w: 10, h: 40 })).toEqual({
      x: 11,
      y: 0,
      w: 1,
      h: 1,
    })
  })
})

describe("geometryForCanvas", () => {
  it("prefere geometria pixel-authoritative do documento", () => {
    const base = layoutForWidgets([widget], ["p"])
    const doc = withPixelGeometry(base, widget, { x: 123, y: 45, w: 300, h: 210 })
    expect(geometryForCanvas(widget, doc)).toEqual({ x: 123, y: 45, w: 300, h: 210 })
  })

  it("deriva pixels da grade quando o objeto não é pixel (documento v2 antigo)", () => {
    const doc = layoutForWidgets([widget], ["p"])
    expect(geometryForCanvas(widget, doc)).toEqual({ x: 320, y: 96, w: 640, h: 288 })
    // sem documento: deriva direto de widget.layout
    expect(geometryForCanvas(widget, null)).toEqual({ x: 320, y: 96, w: 640, h: 288 })
  })
})

describe("withPixelGeometry / preservação em layoutForWidgets", () => {
  it("grava unit pixel e preserva zIndex/visible/layer existentes", () => {
    const base = layoutForWidgets([{ ...widget, config: { type: "shape", shape: "rectangle" } }], ["p"])
    const doc = withPixelGeometry(base, widget, { x: 10, y: 20, w: 30, h: 40 })
    expect(doc.objects.w).toMatchObject({
      x: 10,
      y: 20,
      w: 30,
      h: 40,
      layer: "background",
      visible: true,
      unit: "pixel",
    })
  })

  it("round-trip: readCanvasLayout aceita unit pixel", () => {
    const base = layoutForWidgets([widget], ["p"])
    const doc = withPixelGeometry(base, widget, { x: 1, y: 2, w: 3, h: 4 })
    expect(readCanvasLayout(doc)).toEqual(doc)
  })

  it("layoutForWidgets NÃO sobrescreve objeto pixel com o espelho da grade", () => {
    const base = layoutForWidgets([widget], ["p"])
    const doc = withPixelGeometry(base, widget, { x: 500, y: 300, w: 700, h: 400 })
    const next = layoutForWidgets(
      [{ ...widget, layout: { x: 3, y: 2, w: 5, h: 4 } }],
      ["p"],
      doc
    )
    expect(next.objects.w).toMatchObject({ x: 500, y: 300, w: 700, h: 400, unit: "pixel" })
  })

  it("widget novo sem objeto pixel continua sendo espelhado em grade", () => {
    const other: DashboardWidget = { id: "novo", analysisId: null, layout: { x: 1, y: 0, w: 2, h: 2 } }
    const next = layoutForWidgets([other], ["p"], null)
    expect(next.objects.novo).toMatchObject({ x: 1, y: 0, w: 2, h: 2 })
    expect(next.objects.novo.unit).toBeUndefined()
  })
})
