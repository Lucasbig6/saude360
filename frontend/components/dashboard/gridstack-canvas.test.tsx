import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { act, render, screen, waitFor } from "@testing-library/react"
import { useGridStackItem } from "gridstack/dist/react"
import { GridstackCanvas } from "./gridstack-canvas"
import type { CanvasItem } from "./gridstack-canvas"

// jsdom nasce com 1024px, o que dispara o breakpoint de 10 colunas e escala
// as coordenadas do motor; fixa uma largura de desktop para testar em 12.
const DESKTOP_WIDTH = 1440

beforeAll(() => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: DESKTOP_WIDTH,
  })
})

afterAll(() => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1024,
  })
})

interface TestNode {
  id?: string
  x?: number
  y?: number
  w?: number
  h?: number
  el?: HTMLElement
}

interface TestGrid {
  engine: { nodes: TestNode[] }
  update(el: HTMLElement, opt: Record<string, unknown>): unknown
}

function Marker() {
  const { id } = useGridStackItem()
  return <div data-testid="marker">{id}</div>
}

const COMPONENTS = { widget: Marker }

function getGrid(container: HTMLElement): TestGrid {
  const el = container.querySelector(".grid-stack") as
    | (HTMLElement & { gridstack?: TestGrid })
    | null
  if (!el?.gridstack) throw new Error("grid não inicializado")
  return el.gridstack
}

function markerIds(): string[] {
  return screen.getAllByTestId("marker").map((el) => el.textContent ?? "")
}

describe("GridstackCanvas", () => {
  it("monta o grid, cria um item por elemento e portaliza o conteúdo", async () => {
    const onLayoutChange = vi.fn()
    const { container } = render(
      <GridstackCanvas
        items={[
          { id: "a", x: 0, y: 0, w: 6, h: 4 },
          { id: "b", x: 6, y: 0, w: 6, h: 4 },
        ]}
        components={COMPONENTS}
        onLayoutChange={onLayoutChange}
      />
    )

    expect(container.querySelector(".grid-stack")).toBeTruthy()
    expect(container.querySelectorAll(".grid-stack-item")).toHaveLength(2)
    await waitFor(() => {
      expect(new Set(markerIds())).toEqual(new Set(["a", "b"]))
    })

    // eventos iniciais de montagem não realimentam o estado do chamador
    await act(async () => {
      await Promise.resolve()
    })
    expect(onLayoutChange).not.toHaveBeenCalled()
  })

  it("posiciona os itens no motor conforme o layout informado", async () => {
    const { container } = render(
      <GridstackCanvas
        items={[
          { id: "a", x: 0, y: 0, w: 6, h: 4 },
          { id: "b", x: 6, y: 1, w: 6, h: 3 },
        ]}
        components={COMPONENTS}
      />
    )

    await waitFor(() => {
      const nodes = getGrid(container).engine.nodes
      expect(nodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "a", x: 0, y: 0, w: 6, h: 4 }),
          // float:false compacta para cima — paridade com o verticalCompactor legado
          expect.objectContaining({ id: "b", x: 6, y: 0, w: 6, h: 3 }),
        ])
      )
    })
  })

  it("adiciona e remove itens conforme o array muda (sem remontar o grid)", async () => {
    const two: CanvasItem[] = [
      { id: "a", x: 0, y: 0, w: 6, h: 4 },
      { id: "b", x: 6, y: 0, w: 6, h: 4 },
    ]
    const { container, rerender } = render(
      <GridstackCanvas items={two} components={COMPONENTS} />
    )

    await waitFor(() => {
      expect(container.querySelectorAll(".grid-stack-item")).toHaveLength(2)
    })

    rerender(<GridstackCanvas items={[two[0]]} components={COMPONENTS} />)
    await waitFor(() => {
      expect(container.querySelectorAll(".grid-stack-item")).toHaveLength(1)
      expect(markerIds()).toEqual(["a"])
    })

    rerender(<GridstackCanvas items={two} components={COMPONENTS} />)
    await waitFor(() => {
      expect(container.querySelectorAll(".grid-stack-item")).toHaveLength(2)
      expect(new Set(markerIds())).toEqual(new Set(["a", "b"]))
    })
  })

  it("emite o layout quando um item é movido", async () => {
    const onLayoutChange = vi.fn()
    const { container } = render(
      <GridstackCanvas
        items={[
          { id: "a", x: 0, y: 0, w: 6, h: 4 },
          { id: "b", x: 6, y: 0, w: 6, h: 4 },
        ]}
        components={COMPONENTS}
        onLayoutChange={onLayoutChange}
      />
    )

    await waitFor(() => {
      expect(container.querySelectorAll(".grid-stack-item")).toHaveLength(2)
    })

    const grid = getGrid(container)
    const node = grid.engine.nodes.find((n) => n.id === "a")
    expect(node?.el).toBeTruthy()

    await act(async () => {
      grid.update(node!.el!, { x: 2, w: 4 })
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(onLayoutChange).toHaveBeenCalled()
    })
    const snapshot: CanvasItem[] = onLayoutChange.mock.calls.at(-1)?.[0]
    expect(snapshot).toEqual(
      expect.arrayContaining([
        { id: "a", x: 2, y: 0, w: 4, h: 4 },
        { id: "b", x: 6, y: 0, w: 6, h: 4 },
      ])
    )
  })

  it("posiciona y=Infinity na primeira linha livre e emite a coordenada finita", async () => {
    const onLayoutChange = vi.fn()
    render(
      <GridstackCanvas
        items={[
          { id: "a", x: 0, y: 0, w: 6, h: 4 },
          { id: "novo", x: 0, y: Infinity, w: 6, h: 4 },
        ]}
        components={COMPONENTS}
        onLayoutChange={onLayoutChange}
      />
    )

    await waitFor(() => {
      expect(onLayoutChange).toHaveBeenCalled()
    })
    const snapshot: CanvasItem[] = onLayoutChange.mock.calls.at(-1)?.[0]
    const novo = snapshot.find((item) => item.id === "novo")
    expect(novo).toBeDefined()
    expect(Number.isFinite(novo!.y)).toBe(true)
    expect(novo!.y).toBeGreaterThanOrEqual(0)
    expect(snapshot.find((item) => item.id === "a")).toEqual({
      id: "a",
      x: 0,
      y: 0,
      w: 6,
      h: 4,
    })
  })
})
