import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { VisualizationPanel } from "./visualization-panel"
import { CHART_TYPES } from "@/lib/charts/chart-config"
import { chartTypeLabel } from "@/lib/types/charts"

function renderPanel(
  overrides: Partial<React.ComponentProps<typeof VisualizationPanel>> = {}
) {
  const onChartTypeChange = vi.fn()
  const props: React.ComponentProps<typeof VisualizationPanel> = {
    data: [
      { municipio: "A", total: 10 },
      { municipio: "B", total: 20 },
    ],
    onBackToTable: vi.fn(),
    chartType: "bar",
    onChartTypeChange,
    dimension: null,
    onDimensionChange: vi.fn(),
    metric: null,
    onMetricChange: vi.fn(),
    ...overrides,
  }

  render(<VisualizationPanel {...props} />)
  return { props, onChartTypeChange }
}

describe("VisualizationPanel", () => {
  it("exibe todos os tipos de gráfico no seletor", () => {
    renderPanel()

    for (const type of CHART_TYPES) {
      expect(
        screen.getByRole("option", { name: chartTypeLabel[type] })
      ).toBeTruthy()
    }
  })

  it("chama onChartTypeChange com o tipo escolhido", () => {
    const { onChartTypeChange } = renderPanel()

    fireEvent.change(screen.getByRole("combobox", { name: "Tipo de gráfico" }), {
      target: { value: "kpi" },
    })
    expect(onChartTypeChange).toHaveBeenCalledWith("kpi")

    fireEvent.change(screen.getByRole("combobox", { name: "Tipo de gráfico" }), {
      target: { value: "heatmap" },
    })
    expect(onChartTypeChange).toHaveBeenCalledWith("heatmap")
  })

  it("mantém selecionado o tipo atual e permite trocar para qualquer tipo", () => {
    const { onChartTypeChange } = renderPanel({ chartType: "donut" })
    const selector = screen.getByRole("combobox", { name: "Tipo de gráfico" })

    expect(selector).toHaveProperty("value", "donut")

    for (const type of CHART_TYPES) {
      fireEvent.change(selector, { target: { value: type } })
      expect(onChartTypeChange).toHaveBeenCalledWith(type)
    }
  })
})
