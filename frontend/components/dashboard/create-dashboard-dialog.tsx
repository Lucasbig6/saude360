"use client"

import { useEffect, useState } from "react"
import { AlertCircle, Loader2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import type { Dashboard } from "@/lib/types/dashboard"
import type { Project } from "@/lib/types/project"
import { createDashboard } from "@/lib/api/dashboards"
import { getProjects } from "@/lib/api/projects"
import { ApiError } from "@/lib/api"

interface CreateDashboardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Quando presente, o painel nasce vinculado a este projeto (sem seleção
   * manual). Ausente, o diálogo pergunta em qual projeto criar.
   */
  projectId?: string
  onCreated?: (dashboard: Dashboard) => void
}

export function CreateDashboardDialog({
  open,
  onOpenChange,
  projectId,
  onCreated,
}: CreateDashboardDialogProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [selectedProject, setSelectedProject] = useState("")
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const needsProjectPicker = projectId === undefined

  useEffect(() => {
    if (!open || !needsProjectPicker) return
    let cancelled = false

    getProjects()
      .then((list) => {
        if (!cancelled) setProjects(list)
      })
      .catch(() => {
        if (!cancelled) setProjects([])
      })

    return () => {
      cancelled = true
    }
  }, [open, needsProjectPicker])

  function handleClose(next: boolean) {
    if (next) {
      onOpenChange(true)
      return
    }
    onOpenChange(false)
    setName("")
    setDescription("")
    setSelectedProject("")
    setError(null)
  }

  async function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed || creating) return

    setCreating(true)
    setError(null)

    try {
      const dashboard = await createDashboard({
        name: trimmed,
        description: description.trim(),
        widgets: [],
        filters: [],
        // fixo pelo contexto -> associa; com seletor -> escolha do usuário
        projectId: projectId !== undefined ? projectId : selectedProject || null,
      })
      handleClose(false)
      onCreated?.(dashboard)
    } catch (err) {
      setError(
        err instanceof ApiError ? err.detail : "Erro ao criar o painel."
      )
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo dashboard</DialogTitle>
          <DialogDescription>
            Dê um nome para seu dashboard para encontrá-lo facilmente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle size={15} className="shrink-0" />
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="dashboard-name">Nome *</Label>
            <Input
              id="dashboard-name"
              placeholder="Ex: Atendimentos Mensais"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void handleCreate()
                }
              }}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dashboard-description">Descrição</Label>
            <Input
              id="dashboard-description"
              placeholder="Ex: Visão geral de atendimentos por período."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {needsProjectPicker && (
            <div className="space-y-2">
              <Label htmlFor="dashboard-project">Projeto</Label>
              <select
                id="dashboard-project"
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className={cn(
                  "h-9 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground transition-colors hover:border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                )}
              >
                <option value="">
                  {projects === null
                    ? "Carregando projetos..."
                    : "Sem projeto"}
                </option>
                {(projects ?? []).map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={creating}
          >
            Cancelar
          </Button>
          <Button
            onClick={() => void handleCreate()}
            disabled={!name.trim() || creating}
          >
            {creating ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Plus size={14} />
            )}
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
