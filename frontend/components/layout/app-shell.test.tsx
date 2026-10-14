import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { AppShell } from "./app-shell"

vi.mock("next/navigation", () => ({
  usePathname: () => "/projetos/1/explorar",
}))
vi.mock("./header", () => ({
  Header: () => <header data-testid="app-header" />,
}))

describe("AppShell", () => {
  it("trava o viewport e usa main como scroller único", () => {
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
    expect(main.className).toContain("overflow-y-auto")

    expect(screen.getByTestId("app-header")).toBeInTheDocument()
    expect(screen.getByText("Conteúdo")).toBeInTheDocument()
  })
})
