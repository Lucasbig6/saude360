import { describe, expect, it } from "vitest"
import { datasetDisplayName } from "./datasets"

describe("datasetDisplayName", () => {
  it("prefers the saved MoniSUS display name", () => {
    expect(
      datasetDisplayName({
        table_name: "monisus_ds_ranking_de_municipios_5538f6",
        description: "Indicadores dos municípios",
        extra: JSON.stringify({
          monisus_display_name: "Ranking de municípios",
        }),
      })
    ).toBe("Ranking de municípios")
  })

  it("formats the physical name of datasets published before display names were saved", () => {
    expect(
      datasetDisplayName({
        table_name: "monisus_ds_ranking_de_municipios_5538f6",
      })
    ).toBe("ranking de municipios")
  })
})