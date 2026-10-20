import { afterEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { CanvasStage } from "./canvas-stage"
import type { CanvasStageItem } from "./canvas-stage"
import { DEFAULT_REPORT_PAGE } from "@/lib/canvas-layout"

const page = { ...DEFAULT_REPORT_PAGE, width: 1920, height: 1080 }

function makeItem(overrides: Partial<CanvasStageItem> = {}): CanvasStageItem {
  return {
    id: "a",
    pixel: { x: 100, y: 96, w: 480, h: 240 },
    ...overrides,
  }
}

function renderStage(
  items: CanvasStageItem[],
  props: Partial<Parameters<typeof CanvasStage>[0]> = {}
) {
  return render(
    <CanvasStage page={page} items={items} {...props}>
      {(item) => <div data-testid={`content-${item.id}`}>{item.id}</div>}
    </CanvasStage>
  )
}

function itemStyle(id: string): CSSStyleDeclaration {
  const el = document.querySelector(`[data-stage-item="${id}"]`) as HTMLElement
  return el.style
}

describe("CanvasStage — posicionamento", () => {
  it("renderiza itens nas coordenadas pixel da página", () => {
    renderStage([makeItem()], { editable: true, selectedId: "a" })
    const style = itemStyle("a")
    expect(style.left).toBe("100px")
    expect(style.top).toBe("96px")
    expect(style.width).toBe("480px")
    expect(style.height).toBe("240px")
    expect(screen.getByTestId("content-a")).toBeInTheDocument()
  })

  it("ordena por camada: background < data < foreground; styleZIndex prevalece na camada", () => {
    renderStage(
      [
        makeItem({ id: "bg", layer: "background", zIndex: 900 }),
        makeItem({ id: "data", layer: "data", zIndex: 1 }),
        makeItem({ id: "fg", layer: "foreground", zIndex: 0 }),
        makeItem({ id: "top", layer: "data", styleZIndex: 500 }),
      ],
      { editable: false }
    )
    expect(itemStyle("bg").zIndex).toBe("900")
    expect(itemStyle("data").zIndex).toBe("1001")
    expect(itemStyle("fg").zIndex).toBe("2000")
    expect(itemStyle("top").zIndex).toBe("1500")
  })

  it("oculta itens com visible=false", () => {
    renderStage([makeItem({ visible: false })], { editable: false })
    expect(itemStyle("a").display).toBe("none")
  })
})

describe("CanvasStage — seleção", () => {
  it("clica no item seleciona; clique no fundo desseleciona", () => {
    const onSelect = vi.fn()
    renderStage([makeItem()], { editable: true, onSelect })
    fireEvent.click(screen.getByTestId("content-a"))
    expect(onSelect).toHaveBeenCalledWith("a")
    const stage = document.querySelector("[data-canvas-stage]") as HTMLElement
    fireEvent.pointerDown(stage)
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it("modo edição mostra handle e anel; viewer não", () => {
    const { rerender } = renderStage([makeItem()], { editable: true, selectedId: "a" })
    expect(document.querySelector('[data-stage-handle="a"]')).toBeTruthy()
    expect(document.querySelector('[data-stage-resize="a:se"]')).toBeTruthy()
    rerender(
      <CanvasStage page={page} items={[makeItem()]} editable={false} selectedId="a">
        {(item) => <div>{item.id}</div>}
      </CanvasStage>
    )
    expect(document.querySelector('[data-stage-handle="a"]')).toBeNull()
    expect(document.querySelector('[data-stage-resize="a:se"]')).toBeNull()
  })
})

describe("CanvasStage — mover", () => {
  it("arrasta pelo handle e emite geometria commitada no pointerup", () => {
    const onGeometryChange = vi.fn()
    renderStage([makeItem()], { editable: true, selectedId: "a", onGeometryChange })
    const handle = document.querySelector('[data-stage-handle="a"]') as HTMLElement
    fireEvent.pointerDown(handle, { clientX: 100, clientY: 96, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 160, clientY: 156 })
    // preview ao vivo durante o arrasto
    expect(itemStyle("a").left).toBe("160px")
    expect(itemStyle("a").top).toBe("156px")
    fireEvent.pointerUp(window)
    expect(onGeometryChange).toHaveBeenCalledWith("a", {
      x: 160,
      y: 156,
      w: 480,
      h: 240,
    })
    // rascunho limpo após commit
    expect(itemStyle("a").left).toBe("100px")
  })

  it("clamp nos bounds da página durante o movimento", () => {
    const onGeometryChange = vi.fn()
    renderStage([makeItem()], { editable: true, selectedId: "a", onGeometryChange })
    const handle = document.querySelector('[data-stage-handle="a"]') as HTMLElement
    fireEvent.pointerDown(handle, { clientX: 100, clientY: 96, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 5000, clientY: 5000 })
    fireEvent.pointerUp(window)
    expect(onGeometryChange).toHaveBeenCalledWith("a", {
      x: 1920 - 480,
      y: 1080 - 240,
      w: 480,
      h: 240,
    })
  })

  it("Escape cancela o arrasto sem emitir geometria", () => {
    const onGeometryChange = vi.fn()
    renderStage([makeItem()], { editable: true, selectedId: "a", onGeometryChange })
    const handle = document.querySelector('[data-stage-handle="a"]') as HTMLElement
    fireEvent.pointerDown(handle, { clientX: 100, clientY: 96, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 200, clientY: 200 })
    fireEvent.keyDown(window, { key: "Escape" })
    expect(onGeometryChange).not.toHaveBeenCalled()
    expect(itemStyle("a").left).toBe("100px")
  })
})

describe("CanvasStage — redimensionar", () => {
  it("resize pela borda sudeste aumenta largura/altura e emite geometria", () => {
    const onGeometryChange = vi.fn()
    renderStage([makeItem()], { editable: true, selectedId: "a", onGeometryChange })
    const handle = document.querySelector('[data-stage-resize="a:se"]') as HTMLElement
    fireEvent.pointerDown(handle, { clientX: 580, clientY: 336, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 680, clientY: 416 })
    fireEvent.pointerUp(window)
    expect(onGeometryChange).toHaveBeenCalledWith("a", {
      x: 100,
      y: 96,
      w: 580,
      h: 320,
    })
  })

  it("resize NW move x/y junto e respeita tamanho mínimo", () => {
    const onGeometryChange = vi.fn()
    renderStage([makeItem()], { editable: true, selectedId: "a", onGeometryChange })
    const handle = document.querySelector('[data-stage-resize="a:nw"]') as HTMLElement
    fireEvent.pointerDown(handle, { clientX: 100, clientY: 96, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 0, clientY: 0 })
    fireEvent.pointerUp(window)
    expect(onGeometryChange).toHaveBeenCalledWith("a", {
      x: 0,
      y: 0,
      w: 580,
      h: 336,
    })
  })
})

describe("CanvasStage — fit-to-width", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function renderScaledStage(
    items: CanvasStageItem[],
    props: Partial<Parameters<typeof CanvasStage>[0]>,
    availableWidth: number
  ) {
    const observers: { cb: ResizeObserverCallback }[] = []
    vi.stubGlobal(
      "ResizeObserver",
      class {
        cb: ResizeObserverCallback
        constructor(cb: ResizeObserverCallback) {
          this.cb = cb
          observers.push(this)
        }
        observe() {}
        disconnect() {}
      }
    )
    const result = renderStage(items, props)
    const pageEl = document.querySelector("[data-canvas-stage]") as HTMLElement
    const outer = pageEl.parentElement?.parentElement as HTMLElement
    Object.defineProperty(outer, "clientWidth", {
      configurable: true,
      value: availableWidth,
    })
    act(() => {
      observers[0]?.cb([], observers[0] as unknown as ResizeObserver)
    })
    return result
  }

  it("escala a página para a largura do container e converte o arrasto para espaço de página", () => {
    const onGeometryChange = vi.fn()
    renderScaledStage(
      [makeItem()],
      { editable: true, selectedId: "a", onGeometryChange },
      960
    )
    // 960/1920 = 0.5
    const pageEl = document.querySelector("[data-canvas-stage]") as HTMLElement
    expect(pageEl.style.transform).toBe("scale(0.5)")

    const handle = document.querySelector('[data-stage-handle="a"]') as HTMLElement
    fireEvent.pointerDown(handle, { clientX: 100, clientY: 96, pointerId: 1 })
    // 100px de tela = 200px de página com scale 0.5
    fireEvent.pointerMove(window, { clientX: 200, clientY: 96 })
    fireEvent.pointerUp(window)
    expect(onGeometryChange).toHaveBeenCalledWith("a", {
      x: 300,
      y: 96,
      w: 480,
      h: 240,
    })
  })

  it("converte o ponto de drop considerando o scale", () => {
    const onDropAnalysis = vi.fn()
    renderScaledStage([], { editable: true, onDropAnalysis }, 960)
    const pageEl = document.querySelector("[data-canvas-stage]") as HTMLElement
    pageEl.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 960, bottom: 540, width: 960, height: 540 }) as DOMRect
    const dataTransfer = {
      getData: (type: string) =>
        type === "application/json" ? JSON.stringify({ analysisId: "an-1" }) : "",
      types: ["application/json"],
      dropEffect: "none",
    }
    const dropEvent = new MouseEvent("drop", {
      bubbles: true,
      cancelable: true,
      clientX: 320,
      clientY: 192,
    })
    Object.defineProperty(dropEvent, "dataTransfer", { value: dataTransfer })
    fireEvent(pageEl, dropEvent)
    // 320/0.5=640, 192/0.5=384
    expect(onDropAnalysis).toHaveBeenCalledWith({
      analysisId: "an-1",
      x: 640,
      y: 384,
      w: 960,
      h: 384,
    })
  })
})

describe("CanvasStage — drop HTML5", () => {
  const dataTransfer = {
    getData: (type: string) =>
      type === "application/json" ? JSON.stringify({ analysisId: "an-1" }) : "",
    types: ["application/json"],
    dropEffect: "none",
  }

  it("converte o ponto de drop para retângulo pixel", () => {
    const onDropAnalysis = vi.fn()
    renderStage([], { editable: true, onDropAnalysis })
    const stage = document.querySelector("[data-canvas-stage]") as HTMLElement
    stage.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 1920, bottom: 1080, width: 1920, height: 1080 }) as DOMRect
    // jsdom não repassa clientX via DragEvent; MouseEvent carrega as coordenadas.
    const dropEvent = new MouseEvent("drop", {
      bubbles: true,
      cancelable: true,
      clientX: 320,
      clientY: 192,
    })
    Object.defineProperty(dropEvent, "dataTransfer", { value: dataTransfer })
    fireEvent(stage, dropEvent)
    expect(onDropAnalysis).toHaveBeenCalledWith({
      analysisId: "an-1",
      x: 320,
      y: 192,
      w: 960,
      h: 384,
    })
  })
})
