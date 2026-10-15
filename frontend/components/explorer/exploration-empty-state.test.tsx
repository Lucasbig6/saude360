import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ExplorationEmptyState } from "./exploration-empty-state"

describe("ExplorationEmptyState", () => {
  it("mostra uma mensagem inicial de chat e orienta a seleção de dataset", () => {
    render(<ExplorationEmptyState datasetsError={null} hasDatasets />)

    expect(screen.getByText("Agente")).toBeInTheDocument()
    expect(screen.getByText("Oi! Estou aqui para ajudar você a explorar seus dados.")).toBeInTheDocument()
    expect(screen.getByText(/selecione um dataset na lista de fontes/)).toBeInTheDocument()
    expect(screen.queryByText(/demonstr/i)).not.toBeInTheDocument()
  })

  it("acolhe e explica como começar quando ainda não há datasets", () => {
    render(<ExplorationEmptyState datasetsError={null} hasDatasets={false} />)

    expect(screen.getByText(/vincule uma fonte com datasets publicados/)).toBeInTheDocument()
  })

  it("exibe o erro de carregamento dos datasets", () => {
    render(
      <ExplorationEmptyState
        datasetsError="Falha ao carregar datasets"
        hasDatasets={false}
      />
    )

    expect(screen.getByRole("alert")).toHaveTextContent("Falha ao carregar datasets")
  })
})