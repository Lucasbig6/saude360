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
  it("exibe todos os 11 tipos de gráfico", () => {
    renderPanel()

    for (const type of CHART_TYPES) {
      expect(screen.getByText(chartTypeLabel[type])).toBeTruthy()
    }
  })

  it("chama onChartTypeChange com o tipo escolhido", () => {
    const { onChartTypeChange } = renderPanel()

    fireEvent.click(screen.getByText("Rosca"))
    expect(onChartTypeChange).toHaveBeenCalledWith("donut")

    fireEvent.click(screen.getByText("Mapa de calor"))
    expect(onChartTypeChange).toHaveBeenCalledWith("heatmap")
  })

  it("marca o tipo ativo e permite trocar para qualquer tipo", () => {
    const { onChartTypeChange } = renderPanel({ chartType: "donut" })

    for (const type of CHART_TYPES) {
      fireEvent.click(screen.getByText(chartTypeLabel[type]))
      expect(onChartTypeChange).toHaveBeenCalledWith(type)
    }
  })
})
