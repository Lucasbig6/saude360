import { describe, expect, it, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { DashboardWidgetView } from "./dashboard-widget"
import type { DashboardWidget } from "@/lib/types/dashboard"
import type { WidgetConfig } from "@/lib/types/widgets"

vi.mock("@/lib/api/analyses", () => ({
  getAnalysis: vi.fn(),
  assertChartType: vi.fn(),
}))

vi.mock("@/lib/api/queries", () => ({
  executeQuery: vi.fn(),
  executeQueryFiltered: vi.fn(),
  executePublicQuery: vi.fn(),
}))

function widget(config: WidgetConfig): DashboardWidget {
  return {
    id: "w1",
    analysisId: null,
    layout: { x: 0, y: 0, w: 4, h: 2 },
    config,
  }
}

function noop() {
  /* callbacks opcionais nos testes */
}

const baseProps = {
  filters: [],
  filterValues: {},
  onRemove: vi.fn(),
}

describe("DashboardWidgetView — elementos apresentacionais", () => {
  it("renderiza texto sem card, header ou borda", () => {
    const { container } = render(
      <DashboardWidgetView
        widget={widget({ type: "text", content: "Nota de rodapé", title: "Texto" })}
        {...baseProps}
        onRemove={noop}
      />
    )

    expect(screen.getByText("Nota de rodapé")).toBeTruthy()
    // sem aparência de card
    expect(container.querySelector(".bg-card")).toBeNull()
    expect(container.querySelector(".rounded-lg.border")).toBeNull()
    // sem header/título de widget
    expect(container.querySelector("h3")).toBeNull()
  })

  it("aplica WidgetStyle de fundo/raio no wrapper do texto, ignorando borda", () => {
    const { container } = render(
      <DashboardWidgetView
        widget={widget({
          type: "text",
          content: "Callout",
          style: {
            backgroundColor: "#fef3c7",
            borderColor: "#f59e0b",
            borderWidth: 2,
            borderRadius: 8,
          },
        })}
        {...baseProps}
        onRemove={noop}
      />
    )

    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.style.backgroundColor).toBe("rgb(254, 243, 199)")
    expect(wrapper.style.borderRadius).toBe("8px")
    expect(wrapper.style.borderWidth).toBe("")
  })

  it("mantém o menu de ações oculto até hover/focus e sem cliques quando oculto", () => {
    render(
      <DashboardWidgetView
        widget={widget({ type: "text", content: "Texto" })}
        {...baseProps}
        onRemove={noop}
        onConfigure={noop}
        onDuplicateWidget={noop}
      />
    )

    const overlay = screen.getByLabelText("Ações do widget").parentElement
    expect(overlay?.className).toContain("pointer-events-none")
    expect(overlay?.className).toContain("opacity-0")
    expect(overlay?.className).toContain("group-hover:pointer-events-auto")
    expect(overlay?.className).toContain("focus-within:pointer-events-auto")
  })

  it("exibe as ações do menu (configurar/duplicar/remover) ao abrir", async () => {
    const user = userEvent.setup()
    const onConfigure = vi.fn()
    const onDuplicateWidget = vi.fn()
    const onRemove = vi.fn()
    render(
      <DashboardWidgetView
        widget={widget({ type: "text", content: "Texto" })}
        filters={[]}
        filterValues={{}}
        onRemove={onRemove}
        onConfigure={onConfigure}
        onDuplicateWidget={onDuplicateWidget}
      />
    )

    await user.click(screen.getByLabelText("Ações do widget"))
    const menu = await screen.findByRole("menu")
    await user.click(within(menu).getByText("Configurar"))
    expect(onConfigure).toHaveBeenCalledWith("w1")

    await user.click(screen.getByLabelText("Ações do widget"))
    const menu2 = await screen.findByRole("menu")
    await user.click(within(menu2).getByText("Duplicar"))
    expect(onDuplicateWidget).toHaveBeenCalledWith("w1")

    await user.click(screen.getByLabelText("Ações do widget"))
    const menu3 = await screen.findByRole("menu")
    await user.click(within(menu3).getByText("Remover"))
    expect(onRemove).toHaveBeenCalledWith("w1")
  })

  it("readOnly não renderiza menu de ações", () => {
    const { container } = render(
      <DashboardWidgetView
        widget={widget({ type: "text", content: "Publicado" })}
        {...baseProps}
        onRemove={noop}
        readOnly
      />
    )

    expect(screen.getByText("Publicado")).toBeTruthy()
    expect(screen.queryByLabelText("Ações do widget")).toBeNull()
    expect(container.querySelector(".bg-card")).toBeNull()
  })

  it("renderiza forma sem card e com preenchimento do próprio ShapeView", () => {
    const { container } = render(
      <DashboardWidgetView
        widget={widget({
          type: "shape",
          shape: "rectangle",
          fill: "#0f766e",
          stroke: "#115e59",
          strokeWidth: 2,
        })}
        {...baseProps}
        onRemove={noop}
      />
    )

    expect(container.querySelector(".bg-card")).toBeNull()
    const shape = screen.getByLabelText("rectangle")
    expect(shape.className).toContain("h-full")
    expect(shape.style.backgroundColor).toBe("rgb(15, 118, 110)")
    expect(shape.style.borderWidth).toBe("2px")
  })

  it("centra linha/divisor verticalmente na célula", () => {
    const { container } = render(
      <DashboardWidgetView
        widget={widget({ type: "shape", shape: "divider" })}
        {...baseProps}
        onRemove={noop}
      />
    )

    const divider = screen.getByLabelText("divider")
    expect(divider.className).toContain("h-px")
    expect(divider.parentElement?.className).toContain("items-center")
    expect(container.querySelector(".bg-card")).toBeNull()
  })

  it("ignora moldura de WidgetStyle na forma (fill/stroke são do ShapeView)", () => {
    const { container } = render(
      <DashboardWidgetView
        widget={widget({
          type: "shape",
          shape: "circle",
          fill: "#ec4899",
          style: { borderColor: "#000", borderWidth: 4, backgroundColor: "#fff" },
        })}
        {...baseProps}
        onRemove={noop}
      />
    )

    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.style.borderColor).toBe("")
    expect(wrapper.style.borderWidth).toBe("")
    expect(wrapper.style.backgroundColor).toBe("")
    const circle = screen.getByLabelText("circle")
    expect(circle.style.backgroundColor).toBe("rgb(236, 72, 153)")
  })

  it("renderiza imagem sem card e sem cantos arredondados fixos", () => {
    const { container } = render(
      <DashboardWidgetView
        widget={widget({
          type: "image",
          src: "/logo.png",
          alt: "Logo",
          style: { borderRadius: 12 },
        })}
        {...baseProps}
        onRemove={noop}
      />
    )

    expect(container.querySelector(".bg-card")).toBeNull()
    const img = screen.getByAltText("Logo") as HTMLImageElement
    expect(img.className).not.toContain("rounded-lg")
    expect(img.style.borderRadius).toBe("12px")
    expect(img.getAttribute("src")).toBe("/logo.png")
  })
})

describe("DashboardWidgetView — widgets de dados preservam o card", () => {
  it("KPI mantém card, header e título", () => {
    const { container } = render(
      <DashboardWidgetView
        widget={widget({ type: "kpi", title: "Total de atendimentos", field: "total", function: "sum" })}
        {...baseProps}
        onRemove={noop}
      />
    )

    expect(container.querySelector(".bg-card")).toBeTruthy()
    expect(container.querySelector(".rounded-lg.border")).toBeTruthy()
    expect(screen.getByText("Total de atendimentos")).toBeTruthy()
  })

  it("KPI em readOnly mantém card sem menu de ações", () => {
    const { container } = render(
      <DashboardWidgetView
        widget={widget({ type: "kpi", title: "Total", field: "total", function: "sum" })}
        {...baseProps}
        onRemove={noop}
        readOnly
      />
    )

    expect(container.querySelector(".bg-card")).toBeTruthy()
    expect(screen.queryByLabelText("Ações do widget")).toBeNull()
  })
})

describe("DashboardWidgetView — filtros compactos no canvas", () => {
  const filterConfig: WidgetConfig = { type: "filter", filterId: "f1", title: "Município" }
  const filterDef = {
    id: "f1",
    datasetId: 1,
    column: "municipio",
    operator: "eq" as const,
    defaultValue: "",
    scope: "dashboard" as const,
    controlType: "dropdown" as const,
  }

  it("renderiza filtro compacto sem cabeçalho genérico de card", () => {
    const { container } = render(
      <DashboardWidgetView
        widget={widget(filterConfig)}
        filters={[filterDef]}
        filterValues={{}}
        onRemove={noop}
        onFilterValueChange={vi.fn()}
        distinctValues={{ f1: ["São Paulo", "Rio"] }}
      />
    )

    expect(screen.getByText("Município")).toBeTruthy()
    expect(screen.getByLabelText("municipio")).toBeTruthy()
    // sem header genérico do card analítico (border-b + refresh)
    expect(container.querySelector(".border-b")).toBeNull()
    expect(container.querySelector('[title="Atualizar dados"]')).toBeNull()
    // card compacto presente
    expect(container.querySelector(".bg-card")).toBeTruthy()
  })

  it("mantém menu de ações em overlay no filtro", () => {
    render(
      <DashboardWidgetView
        widget={widget(filterConfig)}
        filters={[filterDef]}
        filterValues={{}}
        onRemove={noop}
        onConfigure={noop}
        onFilterValueChange={vi.fn()}
      />
    )

    const overlay = screen.getByLabelText("Ações do widget").parentElement
    expect(overlay?.className).toContain("pointer-events-none")
    expect(overlay?.className).toContain("group-hover:opacity-100")
  })

  it("mostra mensagem quando o filtro vinculado não existe", () => {
    render(
      <DashboardWidgetView
        widget={widget({ type: "filter", filterId: "missing", title: "Filtro" })}
        filters={[filterDef]}
        filterValues={{}}
        onRemove={noop}
      />
    )

    expect(screen.getByText("Filtro não configurado.")).toBeTruthy()
  })
})
