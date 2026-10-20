import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { DashboardFooter } from "./dashboard-footer"
import type { DashboardPage } from "@/lib/types/dashboard"

const pages: DashboardPage[] = [
  { id: "p1", name: "Visão geral" },
  { id: "p2", name: "Detalhes" },
]

function renderFooter(
  props: Partial<React.ComponentProps<typeof DashboardFooter>> = {}
) {
  return render(
    <DashboardFooter
      pages={pages}
      activePageId="p1"
      onSelectPage={vi.fn()}
      {...props}
    />
  )
}

describe("DashboardFooter", () => {
  it("exibe o logo oficial do SIGDATA com as proporções originais", () => {
    renderFooter()

    const logo = screen.getByAltText("SIGDATA")
    expect(logo).toHaveAttribute("src", expect.stringContaining("Logo"))
    expect(logo).toHaveAttribute("width", "283")
    expect(logo).toHaveAttribute("height", "90")
  })

  it("oculta o logo quando a marca está desativada na aparência", () => {
    renderFooter({ showBrand: false })

    expect(screen.queryByAltText("SIGDATA")).not.toBeInTheDocument()
  })

  it("renderiza o divider entre a marca e as abas apenas com a marca visível", () => {
    const { rerender } = renderFooter()
    expect(screen.getByTestId("footer-brand-divider")).toBeInTheDocument()

    rerender(
      <DashboardFooter
        pages={pages}
        activePageId="p1"
        onSelectPage={vi.fn()}
        showBrand={false}
      />
    )
    expect(screen.queryByTestId("footer-brand-divider")).not.toBeInTheDocument()
  })

  it("renderiza as abas de página e notifica a seleção", () => {
    const onSelectPage = vi.fn()
    renderFooter({ onSelectPage })

    const nav = screen.getByRole("navigation", { name: "Páginas do painel" })
    expect(within(nav).getByRole("button", { name: "Visão geral" })).toHaveAttribute(
      "aria-current",
      "page"
    )

    fireEvent.click(within(nav).getByRole("button", { name: "Detalhes" }))
    expect(onSelectPage).toHaveBeenCalledWith("p2")
  })

  it("aciona atualizar e compartilhar via callbacks", () => {
    const onUpdate = vi.fn()
    const onShare = vi.fn()
    renderFooter({ onUpdate, onShare })

    fireEvent.click(screen.getByRole("button", { name: "Atualizar dados" }))
    expect(onUpdate).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole("button", { name: "Compartilhar painel" }))
    expect(onShare).toHaveBeenCalledTimes(1)
  })

  it("não exibe ações sem comportamento (sem callbacks)", () => {
    renderFooter()

    expect(
      screen.queryByRole("button", { name: "Atualizar dados" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Compartilhar painel" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Editar dashboard" })
    ).not.toBeInTheDocument()
  })

  it("alterna tela cheia pela Fullscreen API e sincroniza o estado", async () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined)
    const exitFullscreen = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      value: requestFullscreen,
      configurable: true,
    })
    Object.defineProperty(document, "exitFullscreen", {
      value: exitFullscreen,
      configurable: true,
    })
    Object.defineProperty(document, "fullscreenElement", {
      value: null,
      configurable: true,
    })

    try {
      renderFooter()

      const enter = screen.getByRole("button", { name: "Tela cheia" })
      fireEvent.click(enter)
      expect(requestFullscreen).toHaveBeenCalledTimes(1)

      // Navegador entrou em tela cheia (ou o usuário saiu via Esc).
      Object.defineProperty(document, "fullscreenElement", {
        value: document.documentElement,
        configurable: true,
      })
      document.dispatchEvent(new Event("fullscreenchange"))

      const exit = await screen.findByRole("button", {
        name: "Sair da tela cheia",
      })
      fireEvent.click(exit)
      expect(exitFullscreen).toHaveBeenCalledTimes(1)
    } finally {
      Object.defineProperty(document, "fullscreenElement", {
        value: null,
        configurable: true,
      })
    }
  })

  it("não renderiza controles de filtro (filtros vivem no canvas)", () => {
    renderFooter()

    expect(screen.queryByPlaceholderText("Valor")).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Filtros do painel" })
    ).not.toBeInTheDocument()
  })

  it("exibe o link de edição apenas quando há permissão", () => {
    const { rerender } = renderFooter({ canEdit: false })
    expect(
      screen.queryByRole("button", { name: "Editar dashboard" })
    ).not.toBeInTheDocument()

    rerender(
      <DashboardFooter
        pages={pages}
        activePageId="p1"
        onSelectPage={vi.fn()}
        canEdit
        editHref="/paineis/d1"
      />
    )
    const edit = screen.getByRole("button", { name: "Editar dashboard" })
    expect(edit.closest("a")).toHaveAttribute("href", "/paineis/d1")
  })
})
