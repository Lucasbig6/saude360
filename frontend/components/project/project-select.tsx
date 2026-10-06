"use client"

import type { Project } from "@/lib/types/project"

interface ProjectSelectProps {
  id?: string
  /** `null` = sem projeto (não enviado no create / removido no update). */
  value: string | null
  onChange: (value: string | null) => void
  projects: Project[]
  loading?: boolean
  disabled?: boolean
}

export function ProjectSelect({
  id = "analysis-project",
  value,
  onChange,
  projects,
  loading = false,
  disabled,
}: ProjectSelectProps) {
  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    onChange(e.target.value === "" ? null : e.target.value)
  }

  return (
    <select
      id={id}
      value={value ?? ""}
      onChange={handleChange}
      disabled={disabled || loading}
      className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground transition-colors hover:border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
    >
      <option value="">
        {loading ? "Carregando projetos..." : "Sem projeto"}
      </option>
      {projects.map((project) => (
        <option key={project.id} value={project.id}>
          {project.name}
        </option>
      ))}
    </select>
  )
}
