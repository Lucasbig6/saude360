"use client"

import { Folder } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Project } from "@/lib/types/project"

interface ProjectPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  projects: Project[]
  onPick: (project: Project) => void
}

/** Escolha de projeto como contexto (preserva o vínculo projectId). */
export function ProjectPickerDialog({
  open,
  onOpenChange,
  title,
  description,
  projects,
  onPick,
}: ProjectPickerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="max-h-64 space-y-1.5 overflow-y-auto py-2">
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => {
                onOpenChange(false)
                onPick(project)
              }}
              className="flex w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition hover:border-primary/40"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Folder size={15} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">
                  {project.name}
                </span>
                {project.description && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {project.description}
                  </span>
                )}
              </span>
            </button>
          ))}
          {projects.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">
              Crie um projeto primeiro para continuar.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
