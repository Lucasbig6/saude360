import { describe, expect, it } from "vitest"
import {
  bringToFront,
  copyWidgetPayload,
  createCustomHtmlElement,
  createFilterWidgetConfig,
  createImageElement,
  createShapeElement,
  createTestIdGenerator,
  createTextElement,
  defaultElementId,
  duplicateWidget,
  isEditorShortcutTargetIgnored,
  nextZIndex,
  pasteWidgetPayload,
  sendToBack,
  withWidgetStyle,
} from "@/lib/dashboard-elements"
import { normalizeWidgetConfig } from "@/lib/types/widgets"
import type { DashboardWidget } from "@/lib/types/dashboard"

function widgetFixture(
  overrides?: Partial<DashboardWidget>,
  generateId?: () => string
): DashboardWidget {
  const gen = generateId ?? createTestIdGenerator()
  return {
    id: gen(),
    analysisId: null,
    layout: { x: 0, y: 0, w: 4, h: 3 },
    config: { type: "text", content: "Olá" },
    pageId: "p1",
    ...overrides,
  }
}

describe("factories de elementos", () => {
  it("cria textos com os defaults da biblioteca", () => {
    expect(createTextElement("body")).toMatchObject({
      type: "text",
      content: "Adicione seu texto",
    })
    expect(createTextElement("heading")).toMatchObject({
      type: "text",
      fontSize: 28,
      fontWeight: 700,
    })
    expect(createTextElement("subtitle")).toMatchObject({
      type: "text",
      fontSize: 18,
      fontWeight: 500,
    })
  })

  it("cria formas com os defaults da biblioteca", () => {
    expect(createShapeElement("rectangle")).toMatchObject({
      type: "shape",
      shape: "rectangle",
      fill: "#f1f5f9",
    })
    expect(createShapeElement("circle")).toMatchObject({
      type: "shape",
      shape: "circle",
    })
  })

  it("cria imagem e rejeita src vazio", () => {
    expect(
      createImageElement("data:image/png;base64,aaa", { title: "Logo" })
    ).toMatchObject({ type: "image", fit: "contain" })
    expect(() => createImageElement("")).toThrow("src da imagem")
  })

  it("cria config de filtro e rejeita filterId vazio", () => {
    expect(createFilterWidgetConfig("f1", "Coluna")).toEqual({
      type: "filter",
      filterId: "f1",
      title: "Coluna",
    })
    expect(() => createFilterWidgetConfig("")).toThrow("filterId")
  })

  it("cria custom-html vazio (sem execução nesta etapa)", () => {
    expect(createCustomHtmlElement()).toEqual({
      type: "custom-html",
      html: "",
      title: undefined,
    })
  })

  it("factories geram configs válidas pelo normalizador", () => {
    for (const config of [
      createTextElement("heading"),
      createShapeElement("circle"),
      createImageElement("data:image/png;base64,aaa"),
      createFilterWidgetConfig("f1"),
      createCustomHtmlElement(),
    ]) {
      expect(() => normalizeWidgetConfig(config)).not.toThrow()
    }
  })
})

describe("geração de IDs", () => {
  it("default usa crypto.randomUUID em produção", () => {
    expect(defaultElementId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    )
  })

  it("geradores de teste são contadores isolados", () => {
    const a = createTestIdGenerator("a")
    const b = createTestIdGenerator("b")
    expect([a(), a()]).toEqual(["a-1", "a-2"])
    expect(b()).toBe("b-1")
  })
})

describe("duplicateWidget", () => {
  it("gera novo ID, clona a config e anexa abaixo", () => {
    const gen = createTestIdGenerator()
    const source = widgetFixture({ layout: { x: 2, y: 5, w: 4, h: 3 } }, gen)
    const copy = duplicateWidget(source, { generateId: gen })
    expect(copy.id).not.toBe(source.id)
    expect(copy.analysisId).toBe(source.analysisId)
    expect(copy.pageId).toBe(source.pageId)
    expect(copy.config).toEqual(source.config)
    expect(copy.config).not.toBe(source.config)
    expect(copy.layout.y).toBe(Number.POSITIVE_INFINITY)
    expect(copy.layout.x).toBe(3)
  })

  it("mantém a referência do filtro (duplica o cartão, não o filtro)", () => {
    const gen = createTestIdGenerator()
    const source = widgetFixture(
      { config: { type: "filter", filterId: "f1" } },
      gen
    )
    const copy = duplicateWidget(source, { generateId: gen })
    expect(copy.config).toEqual({ type: "filter", filterId: "f1" })
  })

  it("clampa o deslocamento horizontal nas bordas do grid", () => {
    const gen = createTestIdGenerator()
    const source = widgetFixture({ layout: { x: 10, y: 0, w: 4, h: 3 } }, gen)
    expect(duplicateWidget(source, { generateId: gen }).layout.x).toBe(8)
  })
})

describe("copiar e colar", () => {
  it("copia config + analysisId e cola na página alvo com novo ID", () => {
    const gen = createTestIdGenerator()
    const source = widgetFixture(
      {
        analysisId: "a1",
        config: { type: "text", content: "X" },
        pageId: "p1",
      },
      gen
    )
    const payload = copyWidgetPayload(source)
    // mutar a origem não afeta o payload copiado
    if (payload.config?.type === "text") payload.config.content = "Y"
    expect(source.config).toEqual({ type: "text", content: "X" })

    const pasted = pasteWidgetPayload(
      copyWidgetPayload(source),
      "p2",
      { generateId: gen }
    )
    expect(pasted.pageId).toBe("p2")
    expect(pasted.analysisId).toBe("a1")
    expect(pasted.config).toEqual({ type: "text", content: "X" })
    expect(pasted.id).not.toBe(source.id)
  })
})

describe("ordem de camadas", () => {
  it("nextZIndex soma 1 ao máximo e respeita o teto", () => {
    const gen = createTestIdGenerator()
    const widgets = [
      widgetFixture({}, gen),
      widgetFixture({ config: { type: "text", content: "a", style: { zIndex: 7 } } }, gen),
    ]
    expect(nextZIndex(widgets)).toBe(8)
    expect(
      nextZIndex([
        widgetFixture(
          { config: { type: "text", content: "a", style: { zIndex: 1000 } } },
          gen
        ),
      ])
    ).toBe(1000)
  })

  it("bringToFront eleva só o alvo; sendToBack zera só o alvo", () => {
    const gen = createTestIdGenerator()
    const widgets = [widgetFixture({}, gen), widgetFixture({}, gen)]
    const front = bringToFront(widgets, widgets[0].id)
    expect(front[0].config?.style?.zIndex).toBe(1)
    expect(front[1].config?.style).toBeUndefined()

    const back = sendToBack(front, widgets[0].id)
    expect(back[0].config?.style?.zIndex).toBe(0)
    expect(back[1].config?.style).toBeUndefined()
  })

  it("ignora widgets sem config (legados sem config explícita)", () => {
    const gen = createTestIdGenerator()
    const widgets = [
      { ...widgetFixture({}, gen), config: undefined },
    ]
    expect(bringToFront(widgets, widgets[0].id)).toBe(widgets)
    expect(sendToBack(widgets, widgets[0].id)).toBe(widgets)
  })

  it("withWidgetStyle mescla o estilo sem perder a config", () => {
    const source = widgetFixture({
      config: { type: "text", content: "a", style: { opacity: 0.5 } },
    })
    const next = withWidgetStyle(source, { zIndex: 3 })
    expect(next.config?.style).toEqual({ opacity: 0.5, zIndex: 3 })
  })
})

describe("isEditorShortcutTargetIgnored", () => {
  it("ignora campos editáveis e diálogos", () => {
    const root = document.createElement("div")
    root.innerHTML =
      '<input id="i"><textarea id="t"></textarea><div role="dialog" id="d"></div><div contenteditable="true" id="c"></div><p id="p"></p>'
    document.body.appendChild(root)
    try {
      for (const id of ["i", "t", "d", "c"]) {
        expect(isEditorShortcutTargetIgnored(root.querySelector(`#${id}`))).toBe(true)
      }
      expect(isEditorShortcutTargetIgnored(root.querySelector("#p"))).toBe(false)
      expect(isEditorShortcutTargetIgnored(null)).toBe(false)
    } finally {
      root.remove()
    }
  })
})
