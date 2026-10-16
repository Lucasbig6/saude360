import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { ProjectTabs } from "./project-tabs"
import * as projectsApi from "@/lib/api/projects"

vi.mock("next/navigation", () => ({
  usePathname: () => "/projetos/p1/paineis",
}))

vi.mock("@/lib/api/projects", () => ({
  getProject: vi.fn(),
}))

describe("ProjectTabs", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(projectsApi.getProject).mockResolvedValue({
      id: "p1",
      name: "Saúde da Família",
      description: "",
      analysisCount: 0,
      chartCount: 0,
      dashboardCount: 0,
      sourceCount: 0,
      createdAt: "",
      updatedAt: "",
    })
  })

  it("monta breadcrumb e abas com a ativa marcada", async () => {
    render(<ProjectTabs projectId="p1" />)

    expect(screen.getByText("Projetos")).toHaveAttribute("href", "/projetos")
    await waitFor(() => {
      expect(screen.getByText("Saúde da Família")).toBeInTheDocument()
    })

    for (const [label, href] of [
      ["Visão geral", "/projetos/p1"],
      ["Painéis", "/projetos/p1/paineis"],
      ["Análises e gráficos", "/projetos/p1/analises"],
      ["Fontes de dados", "/projetos/p1/fontes"],
      ["Explorar", "/projetos/p1/explorar"],
    ]) {
      expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", href)
    }
    expect(screen.getByRole("link", { name: "Painéis" })).toHaveAttribute(
      "aria-current",
      "page"
    )
    expect(screen.getByRole("link", { name: "Visão geral" })).not.toHaveAttribute(
      "aria-current",
      "page"
    )
  })
})
