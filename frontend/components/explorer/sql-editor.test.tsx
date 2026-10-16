import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { SqlEditor } from "./sql-editor"

vi.mock("@/components/sql/sql-editor", () => ({
  SqlEditor: ({ tables }: { tables: { name: string; insertText?: string }[] }) => (
    <ul>
      {tables.map((table) => (
        <li key={table.name}>
          {table.name} | {table.insertText}
        </li>
      ))}
    </ul>
  ),
}))

describe("SqlEditor dataset suggestions", () => {
  it("shows the friendly name while retaining the physical table identifier for SQL", () => {
    render(
      <SqlEditor
        value=""
        onChange={vi.fn()}
        onExecute={vi.fn()}
        loading={false}
        datasets={[
          {
            id: 7,
            table_name: "monisus_ds_ranking_de_municipios_5538f6",
            schema: "public",
            database: { id: 3, database_name: "demo" },
            columns: [],
            extra: JSON.stringify({
              monisus_display_name: "Ranking de municípios",
            }),
          },
        ]}
        columns={[]}
      />
    )

    expect(
      screen.getByText(
        "Ranking de municípios | monisus_ds_ranking_de_municipios_5538f6"
      )
    ).toBeInTheDocument()
  })
})
