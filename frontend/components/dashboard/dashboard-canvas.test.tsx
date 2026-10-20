import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { DashboardCanvas } from "./dashboard-canvas"
import type { Dashboard } from "@/lib/types/dashboard"

vi.mock("./dashboard-widget", () => ({
  DashboardWidgetView: ({
    widget,
    onFilterValueChange,
  }: {
    widget: { id: string }
    onFilterValueChange?: (filterId: string, value: string | string[]) => void
  }) => (
    <div data-testid="widget" data-has-filter-handler={Boolean(onFilterValueChange)}>
      {widget.id}
    </div>
  ),
}))

const dashboard: Dashboard = {
  id: "d",
  name: "Painel",
  description: "",
  widgets: [
    { id: "a", analysisId: "x", layout: { x: 0, y: 0, w: 6, h: 4 }, pageId: "p" },
  ],
  filters: [],
  appearance: {},
  projectId: null,
  createdBy: null,
  createdAt: "",
  updatedAt: "",
  pages: [{ id: "p", name: "Página 1" }],
  activePageId: "p",
}

function stageItem(id: string): HTMLElement {
  return document.querySelector(`[data-stage-item="${id}"]`) as HTMLElement
}

describe("DashboardCanvas", () => {
  it("renderiza os widgets no stage com geometria derivada da grade", () => {
    render(<DashboardCanvas dashboard={dashboard} editing filterValues={{}} />)
    expect(screen.getByTestId("widget")).toHaveTextContent("a")
    // grade {0,0,6,4} → pixels {0,0,960,384} na página 1920
    const el = stageItem("a")
    expect(el.style.left).toBe("0px")
    expect(el.style.top).toBe("0px")
    expect(el.style.width).toBe("960px")
    expect(el.style.height).toBe("384px")
  })

  it("usa geometria pixel-authoritative do layoutDocument quando presente", () => {
    const pixelated: Dashboard = {
      ...dashboard,
      appearance: {
        layoutDocument: {
          version: 2,
          pages: { p: { width: 1920, height: 1080 } },
          objects: {
            a: {
              x: 123,
              y: 45,
              w: 300,
              h: 210,
              zIndex: 0,
              visible: true,
              layer: "data",
              unit: "pixel",
            },
          },
        },
      },
    }
    render(<DashboardCanvas dashboard={pixelated} editing filterValues={{}} />)
    const el = stageItem("a")
    expect(el.style.left).toBe("123px")
    expect(el.style.top).toBe("45px")
    expect(el.style.width).toBe("300px")
    expect(el.style.height).toBe("210px")
  })

  it("encaminha a seleção ao clicar no widget", () => {
    const onSelectWidget = vi.fn()
    render(
      <DashboardCanvas
        dashboard={dashboard}
        editing
        filterValues={{}}
        onSelectWidget={onSelectWidget}
      />
    )
    fireEvent.click(screen.getByTestId("widget"))
    expect(onSelectWidget).toHaveBeenCalledWith("a")
  })

  it("repassa onFilterValueChange aos widgets de filtro do canvas", () => {
    const onFilterValueChange = vi.fn()
    render(
      <DashboardCanvas
        dashboard={dashboard}
        filterValues={{}}
        onFilterValueChange={onFilterValueChange}
      />
    )
    expect(screen.getByTestId("widget")).toHaveAttribute(
      "data-has-filter-handler",
      "true"
    )
  })
})
