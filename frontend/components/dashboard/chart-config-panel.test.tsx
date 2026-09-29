import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { ChartConfigPanel } from "./chart-config-panel"
import type { DatasetColumn } from "@/lib/api/datasets"
import type { WidgetConfig } from "@/lib/types/widgets"

const COLUMNS: DatasetColumn[] = [
  {
    column_name: "municipio",
    type: "VARCHAR",
    is_dttm: false,
    filterable: true,
    groupby: true,
  },
  {
    column_name: "total",
    type: "DOUBLE",
    is_dttm: false,
    filterable: true,
    groupby: false,
  },
]

const BAR_CONFIG: WidgetConfig = {
  type: "bar",
  encoding: { x: "municipio", y: "total" },
  legend: true,
  tooltip: true,
}

describe("ChartConfigPanel", () => {
  it("renderiza os campos de gráfico com as colunas do dataset", () => {
    render(
      <ChartConfigPanel config={BAR_CONFIG} columns={COLUMNS} onApply={vi.fn()} />
    )

    const x = screen.getByLabelText("Dimensão (X)") as HTMLSelectElement
    const y = screen.getByLabelText("Métrica (Y)") as HTMLSelectElement

    expect(x.value).toBe("municipio")
    expect(y.value).toBe("total")
    expect(within(x).getByRole("option", { name: "municipio" })).toBeTruthy()
    expect(within(y).getByRole("option", { name: "total" })).toBeTruthy()
  })

  it("aplica título e campos com config normalizada", () => {
    const onApply = vi.fn()
    render(
      <ChartConfigPanel config={BAR_CONFIG} columns={COLUMNS} onApply={onApply} />
    )

    fireEvent.change(screen.getByPlaceholderText("Nome da análise"), {
      target: { value: "Casos por município" },
    })
    fireEvent.change(screen.getByLabelText("Categoria / série"), {
      target: { value: "municipio" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }))

    expect(onApply).toHaveBeenCalledWith({
      type: "bar",
      title: "Casos por município",
      legend: true,
      tooltip: true,
      encoding: { x: "municipio", y: "total", color: "municipio" },
    })
  })

  it("troca o tipo para KPI preservando o título e edita campo/função", () => {
    const onApply = vi.fn()
    render(
      <ChartConfigPanel
        config={{ ...BAR_CONFIG, title: "Total geral" }}
        columns={COLUMNS}
        onApply={onApply}
      />
    )

    fireEvent.change(screen.getByLabelText("Tipo de widget"), {
      target: { value: "kpi" },
    })
    expect(screen.getByLabelText("Função")).toBeTruthy()

    fireEvent.change(screen.getByLabelText("Campo"), {
      target: { value: "total" },
    })
    fireEvent.change(screen.getByLabelText("Função"), {
      target: { value: "avg" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }))

    expect(onApply).toHaveBeenCalledWith({
      type: "kpi",
      title: "Total geral",
      field: "total",
      function: "avg",
    })
  })

  it("rejeita limite inválido sem chamar onApply", () => {
    const onApply = vi.fn()
    render(
      <ChartConfigPanel config={BAR_CONFIG} columns={COLUMNS} onApply={onApply} />
    )

    fireEvent.change(screen.getByLabelText("Limite de itens"), {
      target: { value: "0" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }))

    expect(onApply).not.toHaveBeenCalled()
    expect(screen.getByText("limit inválido: 0")).toBeTruthy()
  })

  it("edita limite da tabela e conteúdo de texto", () => {
    const onApply = vi.fn()
    const { rerender } = render(
      <ChartConfigPanel
        config={{ type: "table", limit: 50 }}
        columns={COLUMNS}
        onApply={onApply}
      />
    )

    fireEvent.change(screen.getByLabelText("Limite de linhas"), {
      target: { value: "25" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }))
    expect(onApply).toHaveBeenLastCalledWith({ type: "table", limit: 25 })

    rerender(
      <ChartConfigPanel
        key="text-widget"
        config={{ type: "text", content: "antes" }}
        columns={COLUMNS}
        onApply={onApply}
      />
    )
    fireEvent.change(screen.getByLabelText("Conteúdo"), {
      target: { value: "depois" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }))
    expect(onApply).toHaveBeenLastCalledWith({ type: "text", content: "depois" })
  })
})
