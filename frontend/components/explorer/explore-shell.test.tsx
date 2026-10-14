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
    const center = screen.getByText("Conteúdo").parentElement
    expect(center?.className).toContain("flex-col")
    expect(center?.className).toContain("overflow-hidden")
  })

  it("preenche a altura do viewport e faz do rail esquerdo um scroller independente", () => {
    const { container } = render(
      <ExploreShell
        left={<div>Contexto</div>}
        header={<header>Header</header>}
      >
        <div>Conteúdo</div>
      </ExploreShell>
    )

    const root = container.firstElementChild
    expect(root?.className).toContain("h-full")
    expect(root?.className).toContain("min-h-0")

    const aside = document.querySelector("aside")
    expect(aside?.className).toContain("overflow-y-auto")
    expect(aside?.className).toContain("scrollbar-thin")
  })

  it("renderiza a pré-visualização em uma 3ª coluna a partir de xl", () => {
    const { container } = render(
      <ExploreShell
        left={<div>Contexto</div>}
        right={<div>Prévia</div>}
        header={<header>Header</header>}
      >
        <div>Conteúdo</div>
      </ExploreShell>
    )

    const preview = screen.getByLabelText("Pré-visualização da análise")
    expect(preview.tagName).toBe("ASIDE")
    expect(preview.className).toContain("xl:flex")
    expect(preview.className).toContain("hidden")

    const grid = preview.parentElement
    expect(grid?.className).toContain(
      "xl:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)_minmax(0,1.15fr)]"
    )
    expect(container.textContent).toContain("Prévia")
    expect(grid?.querySelectorAll("aside")).toHaveLength(2)
  })
})
