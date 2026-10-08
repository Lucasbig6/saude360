import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ExploreComposer, buildSuggestions } from "./explore-composer"
import type { DatasetColumn, DatasetListItem } from "@/lib/api/datasets"

vi.mock("./sql-editor", () => ({
  SqlEditor: (props: { onExecute: () => void; disabled?: boolean }) => (
    <div data-testid="sql-stub">
      <button
        type="button"
        data-testid="sql-execute"
        disabled={props.disabled}
        onClick={props.onExecute}
      >
        Executar consulta
      </button>
    </div>
  ),
}))

const dataset = {
  id: 1,
  table_name: "demo_atendimentos",
  schema: null,
  database: { id: 1, database_name: "demo" },
  columns: [],
} as unknown as DatasetListItem

function renderComposer(
  overrides: Partial<Parameters<typeof ExploreComposer>[0]> = {}
) {
  const onSubmit = vi.fn()
  const onModeChange = vi.fn()
  const onSqlExecute = vi.fn()
  const onChange = vi.fn()

  render(
    <ExploreComposer
      compact={false}
      mode="ai"
      value=""
      sql=""
      datasets={[dataset]}
      loadingDatasets={false}
      selectedDataset={dataset}
      columns={[]}
      executing={false}
      onChange={onChange}
      onSqlChange={vi.fn()}
      onSqlExecute={onSqlExecute}
      onSelectDataset={vi.fn()}
      {...overrides}
      onSubmit={onSubmit}
      onModeChange={onModeChange}
    />
  )

  return { onSubmit, onModeChange, onSqlExecute, onChange }
}

describe("ExploreComposer", () => {
  it("mostra a chamada e as sugestões no estado expandido", () => {
    renderComposer()

    expect(
      screen.getByRole("heading", {
        name: "O que você quer descobrir?",
      })
    ).toBeTruthy()
    expect(
      screen.getByRole("button", {
        name: "Como evoluíram os atendimentos de janeiro a junho?",
      })
    ).toBeTruthy()
  })

  it("fica compacto sem sugestões quando há investigação em andamento", () => {
    renderComposer({ compact: true })

    expect(
      screen.queryByRole("button", {
        name: "Como evoluíram os atendimentos de janeiro a junho?",
      })
    ).toBeNull()
  })

  it("detecta SQL e envia no modo sql mesmo partindo do modo Perguntar", async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderComposer({
      value: "SELECT * FROM demo_atendimentos",
    })

    await user.click(screen.getByRole("button", { name: "Investigar" }))

    expect(onSubmit).toHaveBeenCalledWith(
      "SELECT * FROM demo_atendimentos",
      "sql"
    )
  })

  it("envia linguagem natural no modo Perguntar", async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderComposer({
      value: "Quantos atendimentos houve?",
    })

    await user.click(screen.getByRole("button", { name: "Investigar" }))

    expect(onSubmit).toHaveBeenCalledWith("Quantos atendimentos houve?", "ai")
  })

  it("bloqueia o envio sem fonte de dados selecionada", () => {
    const { onSubmit } = renderComposer({
      value: "Quantos atendimentos houve?",
      selectedDataset: null,
    })

    expect(
      screen.getByRole("button", { name: "Investigar" })
    ).toBeDisabled()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("no modo SQL hospeda o editor e executa pelo próprio composer", async () => {
    const user = userEvent.setup()
    const { onSqlExecute } = renderComposer({ mode: "sql" })

    expect(screen.getByTestId("sql-stub")).toBeTruthy()
    expect(
      screen.queryByLabelText("Pergunte algo sobre seus dados")
    ).toBeNull()

    await user.click(screen.getByTestId("sql-execute"))
    expect(onSqlExecute).toHaveBeenCalledTimes(1)
  })

  it("alterna os modos Perguntar e SQL pelo toggle do composer", async () => {
    const user = userEvent.setup()
    const { onModeChange } = renderComposer()

    await user.click(screen.getByRole("button", { name: "SQL" }))
    expect(onModeChange).toHaveBeenCalledWith("sql")
  })
})

describe("buildSuggestions", () => {
  it("volta ao genérico sem colunas", () => {
    expect(buildSuggestions([])).toHaveLength(3)
  })

  it("monta sugestões a partir das colunas da fonte", () => {
    const columns = [
      { column_name: "municipio", type: "VARCHAR", is_dttm: false, filterable: true, groupby: true },
      { column_name: "data_atendimento", type: "DATE", is_dttm: true, filterable: true, groupby: false },
      { column_name: "total", type: "INTEGER", is_dttm: false, filterable: false, groupby: false },
    ] as DatasetColumn[]

    expect(buildSuggestions(columns)).toEqual([
      "Como evoluíram total ao longo de data_atendimento?",
      "total por municipio, do maior para o menor",
      "Total por municipio",
    ])
  })
})
