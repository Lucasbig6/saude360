import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { AppShell } from "./app-shell"

const pathname = vi.hoisted(() => ({ value: "/projetos/1/explorar" }))

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
}))
vi.mock("./header", () => ({
  Header: () => <header data-testid="app-header" />,
}))

describe("AppShell", () => {
  it("trava o main no Explorador para rolar a conversa internamente", () => {
    const { container } = render(
      <AppShell>
        <div>Conteúdo</div>
      </AppShell>
    )

    const root = container.firstElementChild
    expect(root?.className).toContain("h-dvh")
    expect(root?.className).toContain("overflow-hidden")

    const main = screen.getByRole("main")
    expect(main.className).toContain("flex-1")
    expect(main.className).toContain("min-h-0")
    expect(main.className).toContain("overflow-hidden")

    expect(screen.getByTestId("app-header")).toBeInTheDocument()
    expect(screen.getByText("Conteúdo")).toBeInTheDocument()
  })

  it("mantém a rolagem normal nas demais páginas", () => {
    pathname.value = "/projetos/1/fontes"

    render(
      <AppShell>
        <div>Conteúdo da fonte</div>
      </AppShell>
    )

    const main = screen.getByRole("main")
    expect(main.className).toContain("overflow-y-auto")
    expect(main.className).not.toContain("overflow-hidden")
  })
})
