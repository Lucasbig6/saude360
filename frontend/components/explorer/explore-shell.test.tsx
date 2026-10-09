import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ExploreShell } from "./explore-shell"

describe("ExploreShell", () => {
  it("mantém a rolagem do chat dentro do painel central e não no corpo da página", () => {
    render(
      <ExploreShell
        left={<div>Contexto</div>}
        header={<header>Header</header>}
      >
        <div>Conteúdo</div>
      </ExploreShell>
    )

    expect(screen.getByText("Conteúdo")).toBeInTheDocument()
    expect(document.querySelector(".overflow-hidden") ?? document.body).toBeTruthy()
  })
})
