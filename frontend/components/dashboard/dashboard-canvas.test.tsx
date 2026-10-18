import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { DashboardCanvas } from "./dashboard-canvas"
import type { Dashboard } from "@/lib/types/dashboard"
import type { CanvasItem } from "./canvas-stage"
import type { CSSProperties, ReactNode } from "react"

interface StageMockProps {
  items: CanvasItem[]
  onSelect?: (id: string | null) => void
  onLayoutChange?: (items: CanvasItem[]) => void
  children: (item: CanvasItem, style: CSSProperties) => ReactNode
}

vi.mock("./canvas-stage", () => ({
  CanvasStage: ({ items, onSelect, onLayoutChange, children }: StageMockProps) => <div data-testid="stage" onClick={() => onSelect?.(null)}>{items.map((item) => <div key={item.id} data-testid={`item-${item.id}`} onClick={event => { event.stopPropagation(); onSelect?.(item.id) }}>{children(item, {})}</div>)}<button onClick={() => onLayoutChange?.(items.map((item) => ({ ...item, x: item.x + 10 })))}>move</button></div>,
}))
vi.mock("./dashboard-widget", () => ({ DashboardWidgetView: ({ widget }: { widget: { id: string } }) => <div data-testid="widget">{widget.id}</div> }))

const dashboard: Dashboard = { id: "d", name: "Painel", description: "", widgets: [{ id: "a", analysisId: "x", layout: { x: 0, y: 0, w: 6, h: 4 }, pageId: "p" }], filters: [], appearance: {}, projectId: null, createdBy: null, createdAt: "", updatedAt: "", pages: [{ id: "p", name: "Página 1" }], activePageId: "p" }

describe("DashboardCanvas", () => {
  it("mantém widgets como HTML sobre a camada espacial", () => { render(<DashboardCanvas dashboard={dashboard} editing filterValues={{}} />); expect(screen.getByTestId("widget")).toHaveTextContent("a") })
  it("encaminha seleção e a geometria livre atualizada", () => { const onSelectWidget = vi.fn(); const onLayoutChange = vi.fn(); render(<DashboardCanvas dashboard={dashboard} editing filterValues={{}} onSelectWidget={onSelectWidget} onLayoutChange={onLayoutChange} />); fireEvent.click(screen.getByTestId("item-a")); expect(onSelectWidget).toHaveBeenCalledWith("a"); fireEvent.click(screen.getByText("move")); expect(onLayoutChange).toHaveBeenCalledWith([expect.objectContaining({ id: "a", x: 10, w: 584 })]) })
})
