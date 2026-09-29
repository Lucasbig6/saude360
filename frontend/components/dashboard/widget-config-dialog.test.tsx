import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { WidgetConfigDialog } from "./widget-config-dialog"
import { getAnalysis } from "@/lib/api/analyses"
import { getDataset } from "@/lib/api/datasets"
import type { DatasetDetail } from "@/lib/api/datasets"
import type { Analysis } from "@/lib/types/analysis"
import type { DashboardWidget } from "@/lib/types/dashboard"

vi.mock("@/lib/api/analyses", () => ({ getAnalysis: vi.fn() }))
vi.mock("@/lib/api/datasets", () => ({ getDataset: vi.fn() }))

const ANALYSIS: Analysis = {
  id: "a1",
  name: "Casos por município",
  description: "",
  sql: "select 1",
  databaseId: 1,
  dbSchema: null,
  datasetId: 5,
  chartType: "bar",
  dimension: "municipio",
  metric: "total",
  projectId: "p1",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
}

const DATASET: DatasetDetail = {
  id: 5,
  table_name: "casos",
  schema: "public",
  description: null,
  database: { id: 1, database_name: "dev" },
  columns: [
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
  ],
}

const WIDGET: DashboardWidget = {
  id: "w1",
  analysisId: "a1",
  layout: { x: 0, y: 0, w: 4, h: 3 },
}

describe("WidgetConfigDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("carrega análise e colunas e salva a configuração editada", async () => {
    vi.mocked(getAnalysis).mockResolvedValue(ANALYSIS)
    vi.mocked(getDataset).mockResolvedValue(DATASET)

    const onSave = vi.fn()
    render(
      <WidgetConfigDialog widget={WIDGET} onOpenChange={vi.fn()} onSave={onSave} />
    )

    await waitFor(() => expect(screen.getByLabelText("Dimensão (X)")).toBeTruthy())
    expect(vi.mocked(getDataset)).toHaveBeenCalledWith(5)

    const x = screen.getByLabelText("Dimensão (X)") as HTMLSelectElement
    expect(x.value).toBe("municipio")

    fireEvent.change(screen.getByLabelText("Título (opcional)"), {
      target: { value: "Renomeado" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }))

    expect(onSave).toHaveBeenCalledWith(
      "w1",
      expect.objectContaining({ type: "bar", title: "Renomeado" })
    )
  })

  it("edita a config existente do widget sem sobrescrever campos", async () => {
    vi.mocked(getAnalysis).mockResolvedValue(ANALYSIS)
    vi.mocked(getDataset).mockResolvedValue(DATASET)

    const onSave = vi.fn()
    render(
      <WidgetConfigDialog
        widget={{
          ...WIDGET,
          config: { type: "table", title: "Tabela antiga", limit: 10 },
        }}
        onOpenChange={vi.fn()}
        onSave={onSave}
      />
    )

    await waitFor(() => expect(screen.getByLabelText("Limite de linhas")).toBeTruthy())

    fireEvent.change(screen.getByLabelText("Limite de linhas"), {
      target: { value: "20" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }))

    expect(onSave).toHaveBeenCalledWith("w1", { type: "table", title: "Tabela antiga", limit: 20 })
  })

  it("não consulta o dataset quando a análise não tem datasetId", async () => {
    vi.mocked(getAnalysis).mockResolvedValue({ ...ANALYSIS, datasetId: null })
    vi.mocked(getDataset).mockResolvedValue(DATASET)

    render(
      <WidgetConfigDialog widget={WIDGET} onOpenChange={vi.fn()} onSave={vi.fn()} />
    )

    await waitFor(() =>
      expect(screen.getByText(/Sem colunas disponíveis/)).toBeTruthy()
    )
    expect(vi.mocked(getDataset)).not.toHaveBeenCalled()
  })

  it("exibe erro quando a análise não carrega", async () => {
    vi.mocked(getAnalysis).mockRejectedValue(new Error("boom"))

    render(
      <WidgetConfigDialog widget={WIDGET} onOpenChange={vi.fn()} onSave={vi.fn()} />
    )

    await waitFor(() =>
      expect(screen.getByText(/Não foi possível carregar/)).toBeTruthy()
    )
    expect(screen.queryByLabelText("Dimensão (X)")).toBeNull()
  })
})
