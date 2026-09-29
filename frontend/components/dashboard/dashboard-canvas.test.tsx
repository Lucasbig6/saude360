import { describe, expect, it, vi } from "vitest"
import { render, waitFor } from "@testing-library/react"
import { DashboardCanvas } from "./dashboard-canvas"
import type { Dashboard } from "@/lib/types/dashboard"

vi.mock("./dashboard-widget", () => ({
  DashboardWidgetView: (props: {
    widget: { id: string }
    readOnly?: boolean
    onRemove: (widgetId: string) => void
  }) => (
    <button
      type="button"
      data-testid="widget-view"
      onClick={() => props.onRemove(props.widget.id)}
    >
      {props.widget.id}
      {props.readOnly ? ":ro" : ":rw"}
    </button>
  ),
}))

function dashboardFixture(): Dashboard {
  return {
    id: "d1",
    name: "Painel",
    description: "",
    slug: "painel",
    widgets: [
      {
        id: "w1",
        analysisId: "a1",
        layout: { x: 0, y: 0, w: 6, h: 4 },
      },
      {
        id: "w2",
        analysisId: "a2",
        layout: { x: 6, y: 0, w: 6, h: 4 },
      },
    ],
    filters: [],
    appearance: {},
    projectId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }
}

describe("DashboardCanvas", () => {
  it("renderiza um portal por widget com os dados do painel", async () => {
    render(
      <DashboardCanvas
        dashboard={dashboardFixture()}
        filterValues={{}}
        readOnly
      />
    )

    await waitFor(() => {
      const views = document.querySelectorAll("[data-testid=widget-view]")
      expect(views).toHaveLength(2)
      expect(new Set([...views].map((el) => el.textContent))).toEqual(
        new Set(["w1:ro", "w2:ro"])
      )
    })
  })

  it("mostra o handle de arrasto somente em modo de edição", async () => {
    const { container, unmount } = render(
      <DashboardCanvas
        dashboard={dashboardFixture()}
        filterValues={{}}
        editing
      />
    )

    await waitFor(() => {
      expect(container.querySelectorAll(".grid-drag-handle")).toHaveLength(2)
    })

    unmount()
    const readOnly = render(
      <DashboardCanvas
        dashboard={dashboardFixture()}
        filterValues={{}}
        readOnly
      />
    )
    await waitFor(() => {
      expect(
        readOnly.container.querySelectorAll(".grid-drag-handle")
      ).toHaveLength(0)
    })
  })

  it("encaminha a remoção do widget ao callback do chamador", async () => {
    const onRemoveWidget = vi.fn()
    render(
      <DashboardCanvas
        dashboard={dashboardFixture()}
        filterValues={{}}
        editing
        onRemoveWidget={onRemoveWidget}
      />
    )

    await waitFor(() => {
      expect(
        document.querySelectorAll("[data-testid=widget-view]")
      ).toHaveLength(2)
    })
    document
      .querySelectorAll<HTMLButtonElement>("[data-testid=widget-view]")[1]
      .click()
    expect(onRemoveWidget).toHaveBeenCalledWith("w2")
  })
})
