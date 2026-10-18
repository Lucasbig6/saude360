import { describe, expect, it } from "vitest"
import { applyCanvasOperation, layoutForWidgets, readCanvasLayout } from "./canvas-layout"

const widget = { id: "w", analysisId: null, layout: { x: 2, y: 1, w: 4, h: 3 } }
describe("canvas layout v2", () => {
  it("converte geometria GridStack antiga para coordenadas de página sem viewport", () => { const document = layoutForWidgets([widget], ["p"]); expect(document.objects.w).toMatchObject({ x: 200, y: 80, w: 384, h: 224 }); expect(document.pages.p).toMatchObject({ width: 1280, height: 720 }) })
  it("aceita apenas documento versionado e aplica operações previsíveis", () => { const document = layoutForWidgets([widget], ["p"]); const next = applyCanvasOperation(document, { type: "set-geometry", id: "w", geometry: { x: 347, w: 500 } }); expect(next.objects.w).toMatchObject({ x: 347, w: 500 }); expect(readCanvasLayout(next)).toEqual(next); expect(readCanvasLayout({ version: 1 })).toBeNull() })
})
