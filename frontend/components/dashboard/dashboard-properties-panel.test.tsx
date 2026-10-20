import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { DashboardPropertiesPanel } from "./dashboard-properties-panel"
import * as analysesApi from "@/lib/api/analyses"
import * as datasetsApi from "@/lib/api/datasets"
import type { DashboardFilter, DashboardWidget } from "@/lib/types/dashboard"

vi.mock("@/lib/api/analyses")
vi.mock("@/lib/api/datasets")

function textWidget(): DashboardWidget {
  return {
    id: "w1",
    analysisId: null,
    layout: { x: 0, y: 4, w: 6, h: 3 },
    config: { type: "text", title: "Nota", content: "Olá" },
    pageId: "p1",
  }
}

function filterWidget(): DashboardWidget {
  return {
    id: "w2",
    analysisId: null,
    layout: { x: 0, y: 0, w: 4, h: 2 },
    config: { type: "filter", filterId: "f1", title: "Filtro" },
    pageId: "p1",
  }
}

const baseFilter: DashboardFilter = {
  id: "f1",
  datasetId: 10,
  column: "municipio",
  operator: "eq",
  defaultValue: "",
  scope: "dashboard",
  controlType: "dropdown",
}

function baseProps(overrides?: Record<string, unknown>) {
  return {
    widget: textWidget(),
    // grade {0,4,6,3} → pixels {0,384,960,288} na página 1920×1080
    pixel: { x: 0, y: 384, w: 960, h: 288 },
    page: { width: 1920, height: 1080 },
    filters: [],
    dashboardAnalysisIds: [],
    linkedCards: 0,
    filterValues: {},
    onSavePixelLayout: vi.fn(),
    onSaveConfig: vi.fn(),
    onSaveFilter: vi.fn(),
    onClearFilterValue: vi.fn(),
    onBringToFront: vi.fn(),
    onSendToBack: vi.fn(),
    onRemoveWidget: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
}

describe("DashboardPropertiesPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(datasetsApi.getDataset).mockResolvedValue({
      table_name: "internacoes",
      columns: [],
    } as never)
    vi.mocked(analysesApi.getAnalyses).mockResolvedValue([])
  })

  it("valida posição e dimensões em pixels antes de salvar o layout", async () => {
    const onSavePixelLayout = vi.fn()
    render(<DashboardPropertiesPanel {...baseProps({ onSavePixelLayout })} />)

    const xInput = screen.getByLabelText("X") as HTMLInputElement
    expect(xInput.value).toBe("0")

    fireEvent.change(xInput, { target: { value: "99999" } })
    expect(await screen.findByRole("alert")).toHaveTextContent(/pixels dentro da página/)
    expect(onSavePixelLayout).not.toHaveBeenCalled()

    fireEvent.change(xInput, { target: { value: "320" } })
    await waitFor(() => {
      expect(onSavePixelLayout).toHaveBeenCalledWith("w1", {
        x: 320,
        y: 384,
        w: 960,
        h: 288,
      })
    })
  })

  it("edita fundo e visibilidade do estilo sem trocar de aba", async () => {
    const onSaveConfig = vi.fn()
    const user = userEvent.setup()
    render(
      <DashboardPropertiesPanel
        {...baseProps({
          widget: filterWidget(),
          filters: [baseFilter],
          onSaveConfig,
        })}
      />
    )

    const bg = document.querySelector('input[type="color"]') as HTMLInputElement
    expect(bg).not.toBeNull()
    fireEvent.change(bg, { target: { value: "#ff0000" } })
    expect(onSaveConfig).toHaveBeenCalledWith(
      "w2",
      expect.objectContaining({
        style: expect.objectContaining({ backgroundColor: "#ff0000" }),
      })
    )

    const visible = screen.getByLabelText(/Visível no painel/i)
    await user.click(visible)
    expect(onSaveConfig).toHaveBeenCalledWith(
      "w2",
      expect.objectContaining({
        style: expect.objectContaining({ visible: false }),
      })
    )
  })

  it("traz para frente e envia para trás pela seção de camada", async () => {
    const onBringToFront = vi.fn()
    const onSendToBack = vi.fn()
    const user = userEvent.setup()
    render(<DashboardPropertiesPanel {...baseProps({ onBringToFront, onSendToBack })} />)

    await user.click(screen.getByRole("button", { name: /Trazer para frente/i }))
    await user.click(screen.getByRole("button", { name: /Enviar para trás/i }))
    expect(onBringToFront).toHaveBeenCalledWith("w1")
    expect(onSendToBack).toHaveBeenCalledWith("w1")
  })

  it("edita o filtro real sem duplicar sua definição", async () => {
    const onSaveFilter = vi.fn()
    const onClearFilterValue = vi.fn()
    const user = userEvent.setup()
    render(
      <DashboardPropertiesPanel
        {...baseProps({
          widget: filterWidget(),
          filters: [baseFilter],
          onSaveFilter,
          onClearFilterValue,
          filterValues: { f1: "Campinas" },
        })}
      />
    )

    await waitFor(() => {
      expect(screen.getByText("internacoes")).toBeInTheDocument()
    })
    expect(screen.getByText("municipio")).toBeInTheDocument()

    const control = screen.getByLabelText(/Tipo de controle/i) as HTMLSelectElement
    fireEvent.change(control, { target: { value: "multi-select" } })
    // tipo e operador andam juntos (multi-select ↔ in) e o valor padrão é
    // re-coerido para a forma do novo operador
    expect(onSaveFilter).toHaveBeenCalledWith("f1", {
      controlType: "multi-select",
      operator: "in",
      defaultValue: [],
    })

    const clear = screen.getByRole("button", { name: /Limpar seleção/i })
    await user.click(clear)
    expect(onClearFilterValue).toHaveBeenCalledWith("f1")
  })

  it("alterna o escopo do filtro para análises específicas", async () => {
    const onSaveFilter = vi.fn()
    vi.mocked(analysesApi.getAnalyses).mockResolvedValue([
      { id: "a1", name: "Análise 1" },
    ] as never)
    const user = userEvent.setup()
    const { rerender } = render(
      <DashboardPropertiesPanel
        {...baseProps({
          widget: filterWidget(),
          filters: [baseFilter],
          dashboardAnalysisIds: ["a1"],
          onSaveFilter,
        })}
      />
    )

    await user.click(screen.getByRole("button", { name: /Análises específicas/i }))
    expect(onSaveFilter).toHaveBeenCalledWith("f1", { scope: [] })

    rerender(
      <DashboardPropertiesPanel
        {...baseProps({
          widget: filterWidget(),
          filters: [{ ...baseFilter, scope: [] }],
          dashboardAnalysisIds: ["a1"],
          onSaveFilter,
        })}
      />
    )

    await waitFor(() => {
      expect(screen.getByText("Análise 1")).toBeInTheDocument()
    })
    await user.click(screen.getByText("Análise 1"))
    expect(onSaveFilter).toHaveBeenCalledWith("f1", { scope: ["a1"] })
  })

  it("avisa quando o filtro vinculado foi excluído", () => {
    render(<DashboardPropertiesPanel {...baseProps({ widget: filterWidget(), filters: [] })} />)
    expect(
      screen.getByText(/filtro vinculado a este cartão foi excluído/i)
    ).toBeInTheDocument()
  })

  it("integra o ChartConfigPanel para gráficos com aplicar explícito", async () => {
    const onSaveConfig = vi.fn()
    vi.mocked(analysesApi.getAnalysis).mockResolvedValue({
      id: "a1",
      name: "Análise 1",
      datasetId: 10,
    } as never)
    vi.mocked(datasetsApi.getDataset).mockResolvedValue({
      table_name: "internacoes",
      columns: [{ column_name: "municipio" }],
    } as never)
    const user = userEvent.setup()
    render(
      <DashboardPropertiesPanel
        {...baseProps({
          widget: {
            id: "w3",
            analysisId: "a1",
            layout: { x: 0, y: 0, w: 6, h: 4 },
            config: { type: "bar", title: "Barras" },
            pageId: "p1",
          },
          onSaveConfig,
        })}
      />
    )

    const title = await screen.findByPlaceholderText("Nome da análise")
    await user.clear(title)
    await user.type(title, "Barras 2")
    await user.click(screen.getByRole("button", { name: /^Aplicar$/i }))

    expect(onSaveConfig).toHaveBeenCalledWith(
      "w3",
      expect.objectContaining({ type: "bar", title: "Barras 2" })
    )
  })

  it("exibe mensagem para widget legado sem configuração", () => {
    render(
      <DashboardPropertiesPanel
        {...baseProps({
          widget: {
            id: "w9",
            analysisId: "a9",
            layout: { x: 0, y: 0, w: 6, h: 4 },
            pageId: "p1",
          },
        })}
      />
    )
    expect(screen.getByText(/Widget legado sem configuração/i)).toBeInTheDocument()
  })

  it("exclui o elemento e volta para a biblioteca", async () => {
    const onRemoveWidget = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<DashboardPropertiesPanel {...baseProps({ onRemoveWidget, onClose })} />)

    await user.click(screen.getByRole("button", { name: /Excluir elemento/i }))
    expect(onRemoveWidget).toHaveBeenCalledWith("w1")

    await user.click(screen.getByTitle("Voltar para a biblioteca"))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("ordena as seções por finalidade: conteúdo → aparência → dimensões → camadas", () => {
    render(
      <DashboardPropertiesPanel
        {...baseProps({
          widget: filterWidget(),
          filters: [baseFilter],
        })}
      />
    )

    const headings = Array.from(
      document.querySelectorAll("aside h3")
    ).map((el) => el.textContent?.trim())

    const filtroIdx = headings.findIndex((h) => h === "Filtro")
    const aparenciaIdx = headings.findIndex((h) => h === "Aparência")
    const dimensoesIdx = headings.findIndex((h) =>
      h?.startsWith("Dimensões e posicionamento")
    )
    const camadasIdx = headings.findIndex((h) => h === "Camadas")

    expect(filtroIdx).toBeGreaterThanOrEqual(0)
    expect(aparenciaIdx).toBeGreaterThan(filtroIdx)
    expect(dimensoesIdx).toBeGreaterThan(aparenciaIdx)
    expect(camadasIdx).toBeGreaterThan(dimensoesIdx)
  })

  it("alinha o elemento à página pela seção de alinhamento", async () => {
    const onAlignToPage = vi.fn()
    const user = userEvent.setup()
    render(<DashboardPropertiesPanel {...baseProps({ onAlignToPage })} />)

    await user.click(screen.getByRole("button", { name: "Centro" }))
    expect(onAlignToPage).toHaveBeenCalledWith("w1", "center-h")

    await user.click(screen.getByRole("button", { name: "Base" }))
    expect(onAlignToPage).toHaveBeenCalledWith("w1", "bottom")
  })
})
