"use client"

import Link from "next/link"
import { Ellipsis, Hospital, LayoutDashboard, Plus, Table2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Project } from "@/lib/types/project"

interface WorkspaceHeaderProps {
  project: Project
  onCreateDashboard: () => void
}

export function WorkspaceHeader({ project, onCreateDashboard }: WorkspaceHeaderProps) {
  return (
    <header className="shrink-0 border-b border-border bg-card">
      <div className="flex min-h-14 items-center gap-3 px-4 sm:px-6">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Hospital size={16} />
        </span>
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {project.name}
        </h1>

        <Button size="sm" onClick={onCreateDashboard}>
          <Plus size={14} />
          <span className="hidden sm:inline">Novo painel</span>
          <span className="sm:hidden">Painel</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Mais opções do projeto"
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Ellipsis size={17} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem render={<Link href={`/projetos/${project.id}/fontes`} />}>
              <Table2 size={14} />
              Gerenciar fontes
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href={`/projetos/${project.id}/analises`} />}>
              <Table2 size={14} />
              Análises do projeto
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href={`/projetos/${project.id}/paineis`} />}>
              <LayoutDashboard size={14} />
              Painéis do projeto
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}