"use client"

import { cn } from "@/lib/utils"
import type { Project } from "@/lib/types/project"

/**
 * Escopo de projeto das listas globais (/analises, /paineis).
 *
 * - `all`    → todos os projetos (default)
 * - `none`   → só itens sem projeto (`project_id IS NULL`)
 * - `<uuid>` → só itens daquele projeto
 *
 * `none` é resolvido no cliente porque a API não aceita sentinela
 * "sem projeto" em `?projectId=`.
 */
export type ProjectFilterValue = "all" | "none" | string

interface ProjectFilterProps {
  id?: string
  value: ProjectFilterValue
  onChange: (value: ProjectFilterValue) => void
  projects: Project[]
  loading?: boolean
  disabled?: boolean
  className?: string
}

export function ProjectFilter({
  id = "project-filter",
  value,
  onChange,
  projects,
  loading = false,
  disabled,
  className,
}: ProjectFilterProps) {
  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    onChange(e.target.value === "" ? "all" : e.target.value)
  }

  return (
    <select
      id={id}
      aria-label="Filtrar por projeto"
      value={value === "all" ? "" : value}
      onChange={handleChange}
      disabled={disabled || loading}
      className={cn(
        "h-9 max-w-[14rem] rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm transition-colors hover:border-slate-300 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
    >
      <option value="">
        {loading ? "Carregando projetos..." : "Todos os projetos"}
      </option>
      <option value="none">Sem projeto</option>
      {projects.map((project) => (
        <option key={project.id} value={project.id}>
          {project.name}
        </option>
      ))}
    </select>
  )
}

/**
 * Lê o valor do filtro a partir da query string. Ausente -> `all`;
 * `none` -> só itens sem projeto; qualquer outro valor é id de projeto.
 */
export function readProjectFilter(raw: string | null): ProjectFilterValue {
  if (!raw || raw === "all") return "all"
  if (raw === "none") return "none"
  return raw
}

/** Monta o href mantendo os demais params da URL. */
export function projectFilterHref(pathname: string, value: ProjectFilterValue, current: URLSearchParams): string {
  const params = new URLSearchParams(current.toString())
  if (value === "all") params.delete("project")
  else params.set("project", value)
  const query = params.toString()
  return `${pathname}${query ? `?${query}` : ""}`
}

/** Rótulo legível do filtro ativo (usado em cabeçalhos/contagens). */
export function projectFilterLabel(
  value: ProjectFilterValue,
  projects: Project[]
): string {
  if (value === "all") return "Todos os projetos"
  if (value === "none") return "Sem projeto"
  return projects.find((project) => project.id === value)?.name ?? "Projeto"
}
