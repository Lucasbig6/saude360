import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import {
  AnalysisThumbnail,
  clearThumbnailCache,
} from "./analysis-thumbnail"
import { executeQuery } from "@/lib/api/queries"
import type { Analysis } from "@/lib/types/analysis"

vi.mock("@/lib/api/queries")
vi.mock("@/components/charts/EChartRenderer", () => ({
  EChartRenderer: (props: { rows: Record<string, unknown>[] }) => (
    <div data-testid="echart">{props.rows.length}</div>
  ),
}))

function makeAnalysis(overrides: Partial<Analysis> = {}): Analysis {
  return {
    id: "analise-1",
    name: "Internações por Município",
    description: "",
    chartType: "bar",
    sql: "SELECT * FROM internacoes",
    databaseId: 1,
    dbSchema: "public",
    datasetId: 10,
    dimension: "municipio",
    metric: "qtd",
    chartConfig: null,
    projectId: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

describe("AnalysisThumbnail", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearThumbnailCache()
    vi.mocked(executeQuery).mockResolvedValue({
      status: "success",
      data: [
        { municipio: "Campinas", qtd: 10 },
        { municipio: "Sorocaba", qtd: 20 },
      ],
    })
  })

  it("renderiza o gráfico quando as linhas chegam", async () => {
    render(<AnalysisThumbnail analysis={makeAnalysis()} />)

    await waitFor(() => {
      expect(screen.getByTestId("echart")).toBeInTheDocument()
    })

    expect(executeQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        database_id: 1,
        sql: "SELECT * FROM internacoes",
        db_schema: "public",
        limit: 100,
      })
    )
  })

  it("mostra mini-tabela para análises de tipo table", async () => {
    render(
      <AnalysisThumbnail
        analysis={makeAnalysis({ chartType: "table", dimension: null, metric: null })}
      />
    )

    await waitFor(() => {
      expect(screen.getByText("municipio")).toBeInTheDocument()
    })
    expect(screen.getByText("Campinas")).toBeInTheDocument()
    expect(screen.queryByTestId("echart")).not.toBeInTheDocument()
  })

  it("mostra o valor agregado para análises KPI", async () => {
    render(
      <AnalysisThumbnail
        analysis={makeAnalysis({ chartType: "kpi", metric: "qtd" })}
      />
    )

    await waitFor(() => {
      expect(screen.getByText("30")).toBeInTheDocument()
    })
  })

  it("mostra fallback quando a consulta falha", async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      status: "error",
      data: [],
      message: "falhou",
    })

    render(<AnalysisThumbnail analysis={makeAnalysis()} />)

    await waitFor(() => {
      expect(screen.getByText("Sem pré-visualização")).toBeInTheDocument()
    })
    expect(screen.queryByTestId("echart")).not.toBeInTheDocument()
  })

  it("mostra 'Sem dados' quando a consulta não retorna linhas", async () => {
    vi.mocked(executeQuery).mockResolvedValue({ status: "success", data: [] })

    render(<AnalysisThumbnail analysis={makeAnalysis()} />)

    await waitFor(() => {
      expect(screen.getByText("Sem dados")).toBeInTheDocument()
    })
  })

  it("não refaz a consulta quando a mesma análise é montada de novo", async () => {
    const { unmount } = render(<AnalysisThumbnail analysis={makeAnalysis()} />)
    await waitFor(() => {
      expect(screen.getByTestId("echart")).toBeInTheDocument()
    })
    unmount()

    render(<AnalysisThumbnail analysis={makeAnalysis()} />)
    await waitFor(() => {
      expect(screen.getByTestId("echart")).toBeInTheDocument()
    })

    expect(executeQuery).toHaveBeenCalledTimes(1)
  })

  it("não consulta nada quando a análise não tem SQL ou banco", async () => {
    render(
      <AnalysisThumbnail analysis={makeAnalysis({ sql: "", databaseId: 0 })} />
    )

    await waitFor(() => {
      expect(screen.getByText("Barras")).toBeInTheDocument()
    })
    expect(executeQuery).not.toHaveBeenCalled()
  })
})
