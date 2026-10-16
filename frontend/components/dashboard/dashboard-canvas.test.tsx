import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, waitFor } from "@testing-library/react"
import { DashboardCanvas } from "./dashboard-canvas"
import type { Dashboard } from "@/lib/types/dashboard"

vi.mock("./dashboard-widget", () => ({
  DashboardWidgetView: (props: {
    widget: { id: string }
    readOnly?: boolean
    onRemove: (widgetId: string) => void
    onDuplicateWidget?: (widgetId: string) => void
    onCopyWidget?: (widgetId: string) => void
    onBringToFront?: (widgetId: string) => void
    onSendToBack?: (widgetId: string) => void
  }) => (
    <div>
      <button
        type="button"
        data-testid="widget-view"
        onClick={() => props.onRemove(props.widget.id)}
      >
        {props.widget.id}
        {props.readOnly ? ":ro" : ":rw"}
      </button>
      {props.onDuplicateWidget && (
        <button
          type="button"
          data-testid={`duplicate-${props.widget.id}`}
          onClick={() => props.onDuplicateWidget?.(props.widget.id)}
        >
          dup
        </button>
      )}
      {props.onCopyWidget && (
        <button
          type="button"
          data-testid={`copy-${props.widget.id}`}
          onClick={() => props.onCopyWidget?.(props.widget.id)}
        >
          copy
        </button>
      )}
      {props.onBringToFront && (
        <button
          type="button"
          data-testid={`front-${props.widget.id}`}
          onClick={() => props.onBringToFront?.(props.widget.id)}
        >
          front
        </button>
      )}
      {props.onSendToBack && (
        <button
          type="button"
          data-testid={`back-${props.widget.id}`}
          onClick={() => props.onSendToBack?.(props.widget.id)}
        >
          back
        </button>
      )}
    </div>
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
    createdBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    pages: [{ id: "p1", name: "Página 1" }],
    activePageId: "p1",
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

  it("destaca o widget selecionado somente em modo de edição", async () => {
    const { container, unmount } = render(
      <DashboardCanvas
        dashboard={dashboardFixture()}
        filterValues={{}}
        editing
        selectedWidgetId="w1"
      />
    )

    await waitFor(() => {
      expect(
        container.querySelector('[data-widget-id="w1"]')
      ).not.toBeNull()
    })
    const selected = container.querySelector('[data-widget-id="w1"]')
    expect(selected?.getAttribute("aria-selected")).toBe("true")
    expect(selected?.querySelector(".ring-primary")).not.toBeNull()
    const other = container.querySelector('[data-widget-id="w2"]')
    expect(other?.getAttribute("aria-selected")).toBe("false")
    expect(other?.querySelector(".ring-primary")).toBeNull()

    unmount()
    const readOnly = render(
      <DashboardCanvas
        dashboard={dashboardFixture()}
        filterValues={{}}
        readOnly
        selectedWidgetId="w1"
      />
    )
    await waitFor(() => {
      expect(
        readOnly.container.querySelector('[data-widget-id="w1"]')
      ).not.toBeNull()
    })
    expect(
      readOnly.container.querySelector('[data-widget-id="w1"]')?.hasAttribute("aria-selected")
    ).toBe(false)
    expect(
      readOnly.container.querySelector(".ring-primary")
    ).toBeNull()
  })

  it("seleciona ao pressionar o widget e desseleciona no fundo", async () => {
    const onSelectWidget = vi.fn()
    const { container } = render(
      <DashboardCanvas
        dashboard={dashboardFixture()}
        filterValues={{}}
        editing
        selectedWidgetId="w1"
        onSelectWidget={onSelectWidget}
      />
    )

    await waitFor(() => {
      expect(container.querySelector('[data-widget-id="w2"]')).not.toBeNull()
    })
    fireEvent.pointerDown(
      container.querySelector('[data-widget-id="w2"]') as HTMLElement
    )
    expect(onSelectWidget).toHaveBeenCalledWith("w2")

    // fundo do canvas: alvo fora de qualquer .grid-stack-item
    fireEvent.pointerDown(container.firstElementChild as HTMLElement)
    expect(onSelectWidget).toHaveBeenCalledWith(null)
  })

  it("encaminha duplicar, copiar e camadas aos callbacks", async () => {
    const onDuplicateWidget = vi.fn()
    const onCopyWidget = vi.fn()
    const onBringToFront = vi.fn()
    const onSendToBack = vi.fn()
    render(
      <DashboardCanvas
        dashboard={dashboardFixture()}
        filterValues={{}}
        editing
        onDuplicateWidget={onDuplicateWidget}
        onCopyWidget={onCopyWidget}
        onBringToFront={onBringToFront}
        onSendToBack={onSendToBack}
      />
    )

    await waitFor(() => {
      expect(document.querySelector("[data-testid=duplicate-w1]")).not.toBeNull()
    })
    document
      .querySelector<HTMLButtonElement>("[data-testid=duplicate-w1]")
      ?.click()
    document.querySelector<HTMLButtonElement>("[data-testid=copy-w1]")?.click()
    document.querySelector<HTMLButtonElement>("[data-testid=front-w1]")?.click()
    document.querySelector<HTMLButtonElement>("[data-testid=back-w1]")?.click()
    expect(onDuplicateWidget).toHaveBeenCalledWith("w1")
    expect(onCopyWidget).toHaveBeenCalledWith("w1")
    expect(onBringToFront).toHaveBeenCalledWith("w1")
    expect(onSendToBack).toHaveBeenCalledWith("w1")
  })
})
