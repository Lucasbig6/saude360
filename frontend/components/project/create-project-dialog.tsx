"use client"

import { useState } from "react"
import { AlertCircle, Loader2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Project } from "@/lib/types/project"
import { createProject } from "@/lib/api/projects"
import { ApiError } from "@/lib/api"

interface CreateProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (project: Project) => void
}

/** Criação de projeto (mesma API/modelo em todos os pontos de entrada). */
export function CreateProjectDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateProjectDialogProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setName("")
    setDescription("")
    setError(null)
  }

  async function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed || creating) return

    setCreating(true)
    setError(null)

    try {
      const project = await createProject({
        name: trimmed,
        description: description.trim() || null,
      })
      reset()
      onOpenChange(false)
      onCreated?.(project)
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Erro ao criar o projeto.")
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo projeto</DialogTitle>
          <DialogDescription>
            Dê um nome para o projeto para encontrá-lo facilmente depois.
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
            <Label htmlFor="new-project-name">Nome *</Label>
            <Input
              id="new-project-name"
              placeholder="Ex: Atendimentos Hospitalares"
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
            <Label htmlFor="new-project-description">Descrição</Label>
            <Input
              id="new-project-description"
              placeholder="Ex: Indicadores de demanda e ocupação hospitalar."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              reset()
              onOpenChange(false)
            }}
            disabled={creating}
          >
            Cancelar
          </Button>
          <Button onClick={() => void handleCreate()} disabled={!name.trim() || creating}>
            {creating ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Plus size={14} />
            )}
            Criar projeto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
