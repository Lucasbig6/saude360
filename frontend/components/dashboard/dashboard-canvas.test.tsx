import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { DashboardCanvas } from "./dashboard-canvas"
import type { Dashboard } from "@/lib/types/dashboard"
import type { CanvasItem } from "./gridstack-canvas"

// O WidgetPortal só vive dentro do GridStack real; estes hooks mockados
// permitem que ele renderize dentro do mock do GridstackCanvas.
vi.mock("gridstack/dist/react", () => ({
  useGridStack: () => ({ grid: null }),
  useGridStackItem: () => ({ id: "a" }),
}))

interface GridstackCanvasMockProps {
  items: CanvasItem[]
  editable?: boolean
  components?: Record<string, React.ComponentType>
  onLayoutChange?: (items: CanvasItem[]) => void
}

vi.mock("./gridstack-canvas", () => ({
  GridstackCanvas: ({
    items,
    components,
    onLayoutChange,
  }: GridstackCanvasMockProps) => (
    <div data-testid="stage">
      {items.map((item) => {
        const Widget = components?.widget
        return (
          <div key={item.id} data-testid={`item-${item.id}`}>
            {Widget ? <Widget /> : item.id}
          </div>
        )
      })}
      <button
        onClick={() =>
          onLayoutChange?.(items.map((item) => ({ ...item, x: item.x + 2 })))
        }
      >
        move
      </button>
    </div>
  ),
}))
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

describe("DashboardCanvas", () => {
  it("renderiza o GridStack com os widgets", () => {
    render(<DashboardCanvas dashboard={dashboard} editing filterValues={{}} />)
    expect(screen.getByTestId("item-a")).toHaveTextContent("a")
  })

  it("encaminha o layout atualizado ao GridStack", () => {
    const onLayoutChange = vi.fn()
    render(
      <DashboardCanvas
        dashboard={dashboard}
        editing
        filterValues={{}}
        onLayoutChange={onLayoutChange}
      />
    )
    fireEvent.click(screen.getByText("move"))
    expect(onLayoutChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: "a", x: 2, y: 0, w: 6, h: 4 }),
    ])
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
