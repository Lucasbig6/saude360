import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { Analysis } from "@/lib/types/analysis"
import { SourcesRail } from "./sources-rail"

const analysesDemo: Analysis[] = [
  {
    id: "1",
    name: "Análise de internações",
    description: "Comparativo por município",
    sql: "SELECT 1",
    databaseId: 1,
    dbSchema: null,
    datasetId: null,
    chartType: "bar",
    dimension: null,
    metric: null,
    chartConfig: null,
    projectId: "proj-1",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  },
]

describe("SourcesRail", () => {
  it("organiza o contexto do projeto em blocos mais claros para o usuário", () => {
    render(
      <SourcesRail
        projectId="proj-1"
        projectName="Projeto demo"
        datasets={[
          {
            id: 10,
            table_name: "hospital_atendimentos",
            schema: "public",
            description: "Atendimentos de hospitais",
            database: { id: 1, database_name: "main" },
            columns: [],
          },
        ]}
        loadingDatasets={false}
        datasetsError={null}
        selectedDatasetId={10}
        selectedDatasetName="hospital_atendimentos"
        onSelectDataset={() => undefined}
        analyses={analysesDemo}
        analysesError={null}
      />
    )

    expect(screen.getByText("Contexto da sessão")).toBeInTheDocument()
    expect(screen.getByText("Projeto")).toBeInTheDocument()
    expect(screen.getByText("Fonte ativa")).toBeInTheDocument()
    expect(screen.getByText("Fontes disponíveis")).toBeInTheDocument()
    expect(screen.getByText("Análises recentes")).toBeInTheDocument()
  })
})
