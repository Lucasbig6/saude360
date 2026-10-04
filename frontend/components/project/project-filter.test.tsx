import { describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import {
  ProjectFilter,
  projectFilterHref,
  projectFilterLabel,
  readProjectFilter,
  type ProjectFilterValue,
} from "@/components/project/project-filter"
import type { Project } from "@/lib/types/project"

function makeProject(id: string, name: string): Project {
  return {
    id,
    name,
    description: "",
    analysisCount: 0,
    chartCount: 0,
    dashboardCount: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  }
}

const projects: Project[] = [
  makeProject("p1", "Monitoramento SUS"),
  makeProject("p2", "Cobertura vacinal"),
]

describe("ProjectFilter", () => {
  it("renderiza 'Todos os projetos' como opção padrão e inclui 'Sem projeto'", () => {
    render(
      <ProjectFilter value="all" onChange={vi.fn()} projects={projects} />
    )

    const select = screen.getByLabelText("Filtrar por projeto") as HTMLSelectElement
    expect(select.value).toBe("")

    const labels = screen.getAllByRole("option").map((o) => o.textContent)
    expect(labels[0]).toBe("Todos os projetos")
    expect(labels).toContain("Sem projeto")
    expect(labels).toContain("Monitoramento SUS")
    expect(labels).toContain("Cobertura vacinal")
  })

  it("dispara onChange com o projeto escolhido", () => {
    const onChange = vi.fn()
    render(
      <ProjectFilter value="all" onChange={onChange} projects={projects} />
    )

    fireEvent.change(screen.getByLabelText("Filtrar por projeto"), {
      target: { value: "p2" },
    })
    expect(onChange).toHaveBeenCalledWith("p2")
  })

  it("dispara onChange com 'all' quando o usuário limpa o filtro", () => {
    const onChange = vi.fn()
    render(
      <ProjectFilter value="p1" onChange={onChange} projects={projects} />
    )

    fireEvent.change(screen.getByLabelText("Filtrar por projeto"), {
      target: { value: "" },
    })
    expect(onChange).toHaveBeenCalledWith("all")
  })

  it("fica desabilitado enquanto carrega", () => {
    render(
      <ProjectFilter
        value="all"
        onChange={vi.fn()}
        projects={[]}
        loading={true}
      />
    )

    const select = screen.getByLabelText("Filtrar por projeto")
    expect(select).toBeDisabled()
    expect(screen.getByRole("option", { name: /Carregando projetos/ })).toBeInTheDocument()
  })
})

describe("readProjectFilter", () => {
  it("normaliza a query string", () => {
    expect(readProjectFilter(null)).toBe("all")
    expect(readProjectFilter("")).toBe("all")
    expect(readProjectFilter("all")).toBe("all")
    expect(readProjectFilter("none")).toBe("none")
    expect(readProjectFilter("uuid-123")).toBe("uuid-123")
  })
})

describe("projectFilterHref", () => {
  it("adiciona, troca e remove o param sem perder os demais", () => {
    const current = new URLSearchParams("page=2")

    expect(projectFilterHref("/paineis", "p1", current)).toBe(
      "/paineis?page=2&project=p1"
    )
    expect(projectFilterHref("/paineis", "none", current)).toBe(
      "/paineis?page=2&project=none"
    )
    expect(projectFilterHref("/paineis", "all", current)).toBe(
      "/paineis?page=2"
    )
  })

  it("substitui um project já presente", () => {
    const current = new URLSearchParams("project=old")
    expect(projectFilterHref("/analises", "p2", current)).toBe(
      "/analises?project=p2"
    )
    expect(projectFilterHref("/analises", "all", current)).toBe("/analises")
  })
})

describe("projectFilterLabel", () => {
  it("resolve rótulos legíveis", () => {
    expect(projectFilterLabel("all", projects)).toBe("Todos os projetos")
    expect(projectFilterLabel("none", projects)).toBe("Sem projeto")
    expect(projectFilterLabel("p2", projects)).toBe("Cobertura vacinal")
    expect(projectFilterLabel("desconhecido", projects)).toBe("Projeto")
  })

  it("tipa os três estados do filtro", () => {
    const values: ProjectFilterValue[] = ["all", "none", "p1"]
    expect(values).toHaveLength(3)
  })
})
