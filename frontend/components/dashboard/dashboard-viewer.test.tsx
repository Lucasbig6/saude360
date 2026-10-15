import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { DashboardViewer } from "./dashboard-viewer"
import type { Dashboard } from "@/lib/types/dashboard"

const { getDistinctValuesMock } = vi.hoisted(() => ({
  getDistinctValuesMock: vi.fn(),
}))

vi.mock("@/lib/api/datasets", () => ({
  getDistinctValues: getDistinctValuesMock,
}))

vi.mock("./dashboard-canvas", () => ({
  DashboardCanvas: (props: {
    dashboard: { widgets: { id: string }[] }
    refreshKey?: number
    filterValues: Record<string, string | string[]>
    publicMode?: boolean
    readOnly?: boolean
  }) => (
    <div
      data-testid="canvas"
      data-widget-ids={props.dashboard.widgets.map((w) => w.id).join(",")}
      data-refresh-key={String(props.refreshKey ?? 0)}
      data-public-mode={String(Boolean(props.publicMode))}
      data-read-only={String(Boolean(props.readOnly))}
      data-filter-values={JSON.stringify(props.filterValues)}
    />
  ),
}))

vi.mock("./share-dashboard-dialog", () => ({
  ShareDashboardDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="share-dialog" /> : null,
}))

vi.mock("./dashboard-copilot", () => ({
  DashboardCopilot: () => null,
}))

function dashboardFixture(): Dashboard {
  return {
    id: "d1",
    name: "Painel compartilhado",
    description: "Descrição do painel",
    slug: "painel",
    widgets: [
      {
        id: "w1",
        analysisId: "a1",
        layout: { x: 0, y: 0, w: 6, h: 4 },
        pageId: "p1",
      },
      {
        id: "w2",
        analysisId: "a2",
        layout: { x: 6, y: 0, w: 6, h: 4 },
        pageId: "p2",
      },
    ],
    filters: [
      {
        id: "f1",
        datasetId: 7,
        column: "regiao",
        operator: "eq",
        defaultValue: "Norte",
        scope: "dashboard",
      },
    ],
    appearance: {},
    projectId: null,
    createdBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    pages: [
      { id: "p1", name: "Visão geral" },
      { id: "p2", name: "Detalhes" },
    ],
    activePageId: "p1",
  }
}

describe("DashboardViewer", () => {
  beforeEach(() => {
    getDistinctValuesMock.mockReset()
    getDistinctValuesMock.mockResolvedValue({ result: ["Norte", "Sul"] })
  })

  it("mantém a footer no fluxo, abaixo da área de rolagem, sem sobreposição", () => {
    const { container } = render(<DashboardViewer dashboard={dashboardFixture()} />)

    const root = container.firstElementChild as HTMLElement
    expect(root).toHaveClass("h-dvh", "flex-col", "overflow-hidden")

    const footer = screen.getByTestId("dashboard-footer")
    expect(footer).not.toHaveClass("fixed")
    expect(root.lastElementChild).toBe(footer)
  })

  it("exibe o logo e as ações globais na footer, não no cabeçalho", () => {
    render(<DashboardViewer dashboard={dashboardFixture()} />)

    const footer = screen.getByTestId("dashboard-footer")
    expect(within(footer).getByAltText("SIGDATA")).toBeInTheDocument()
    expect(
      within(footer).getByRole("button", { name: "Atualizar dados" })
    ).toBeInTheDocument()
    expect(
      within(footer).getByRole("button", { name: "Compartilhar painel" })
    ).toBeInTheDocument()

    const header = screen
      .getByRole("heading", { level: 1, name: "Painel compartilhado" })
      .closest("header")
    expect(header).not.toBeNull()
    expect(
      within(header as HTMLElement).queryByRole("button", {
        name: "Atualizar dados",
      })
    ).not.toBeInTheDocument()
    expect(
      within(header as HTMLElement).queryByRole("button", {
        name: "Compartilhar painel",
      })
    ).not.toBeInTheDocument()
  })

  it("não exibe o logo quando a marca está desativada", () => {
    const dashboard = dashboardFixture()
    dashboard.appearance = { showBrand: false }
    render(<DashboardViewer dashboard={dashboard} />)

    expect(screen.queryByAltText("SIGDATA")).not.toBeInTheDocument()
  })

  it("escopa os widgets pela página ativa e troca de aba re-renderiza", async () => {
    render(<DashboardViewer dashboard={dashboardFixture()} />)

    const canvas = await screen.findByTestId("canvas")
    expect(canvas).toHaveAttribute("data-widget-ids", "w1")
    expect(canvas).toHaveAttribute("data-read-only", "true")

    fireEvent.click(screen.getByRole("button", { name: "Detalhes" }))
    await waitFor(() => {
      expect(screen.getByTestId("canvas")).toHaveAttribute(
        "data-widget-ids",
        "w2"
      )
    })
  })

  it("atualiza os dados dos widgets pela ação da footer", async () => {
    render(<DashboardViewer dashboard={dashboardFixture()} />)
    await screen.findByTestId("canvas")

    fireEvent.click(
      within(screen.getByTestId("dashboard-footer")).getByRole("button", {
        name: "Atualizar dados",
      })
    )

    await waitFor(() => {
      expect(screen.getByTestId("canvas")).toHaveAttribute(
        "data-refresh-key",
        "1"
      )
    })
  })

  it("abre o diálogo de compartilhamento pela ação da footer", async () => {
    render(<DashboardViewer dashboard={dashboardFixture()} />)
    await screen.findByTestId("canvas")

    fireEvent.click(
      within(screen.getByTestId("dashboard-footer")).getByRole("button", {
        name: "Compartilhar painel",
      })
    )

    expect(await screen.findByTestId("share-dialog")).toBeInTheDocument()
  })

  it("repassa mudanças de filtro do canvas", async () => {
    render(<DashboardViewer dashboard={dashboardFixture()} />)
    await screen.findByTestId("canvas")

    expect(screen.getByTestId("canvas")).toHaveAttribute(
      "data-filter-values",
      expect.stringContaining('"f1":"Norte"')
    )

    // Valores distintos carregados (modo autenticado) → o filtro vira select.
    const select = await screen.findByRole("combobox")
    fireEvent.change(select, { target: { value: "Sul" } })

    await waitFor(() => {
      expect(screen.getByTestId("canvas")).toHaveAttribute(
        "data-filter-values",
        expect.stringContaining('"f1":"Sul"')
      )
    })
  })

  it("carrega valores distintos apenas no modo autenticado", async () => {
    const { unmount } = render(<DashboardViewer dashboard={dashboardFixture()} />)
    await screen.findByTestId("canvas")

    await waitFor(() => {
      expect(getDistinctValuesMock).toHaveBeenCalledWith(7, "regiao")
    })
    unmount()

    getDistinctValuesMock.mockClear()
    render(<DashboardViewer dashboard={dashboardFixture()} publicMode />)
    await screen.findByTestId("canvas")

    expect(getDistinctValuesMock).not.toHaveBeenCalled()
  })

  it("oferece o link de edição somente com permissão", () => {
    const { rerender } = render(
      <DashboardViewer dashboard={dashboardFixture()} canEdit editHref="/paineis/d1" />
    )

    const footer = screen.getByTestId("dashboard-footer")
    const edit = within(footer).getByRole("button", { name: "Editar dashboard" })
    expect(edit.closest("a")).toHaveAttribute("href", "/paineis/d1")

    rerender(
      <DashboardViewer dashboard={dashboardFixture()} canEdit={false} />
    )
    expect(
      within(screen.getByTestId("dashboard-footer")).queryByRole("button", {
        name: "Editar dashboard",
      })
    ).not.toBeInTheDocument()
  })
})
