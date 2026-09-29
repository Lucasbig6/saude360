import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { PreviewChart } from "./preview-chart"
import type { ChartConfig } from "@/lib/charts/chart-config"

const rendered: { config: ChartConfig; rows: Record<string, unknown>[] }[] = []

vi.mock("@/components/charts/EChartRenderer", () => ({
  EChartRenderer: (props: { config: ChartConfig; rows: Record<string, unknown>[] }) => {
    rendered.push(props)
    return <div data-testid="echart" />
  },
}))

describe("PreviewChart", () => {
  it("mostra estado vazio sem dimensão, métrica ou dados válidos", () => {
    render(
      <PreviewChart
        data={[{ municipio: "A", total: null }]}
        chartType="bar"
        dimension="municipio"
        metric="total"
      />
    )

    expect(screen.getByText("Nenhum dado válido para visualizar.")).toBeTruthy()
    expect(screen.queryByTestId("echart")).toBeNull()
  })

  it("renderiza o gráfico ECharts com encoding e linhas filtradas", () => {
    rendered.length = 0
    render(
      <PreviewChart
        data={[
          { municipio: "A", total: 10 },
          { municipio: "B", total: "não-numérico" },
          { municipio: "C", total: 20 },
        ]}
        chartType="line"
        dimension="municipio"
        metric="total"
      />
    )

    expect(screen.getByTestId("echart")).toBeTruthy()
    expect(rendered).toHaveLength(1)
    expect(rendered[0].config).toEqual({
      type: "line",
      encoding: { x: "municipio", y: "total" },
      legend: true,
      tooltip: true,
    })
    expect(rendered[0].rows).toEqual([
      { municipio: "A", total: 10 },
      { municipio: "C", total: 20 },
    ])
  })
})
