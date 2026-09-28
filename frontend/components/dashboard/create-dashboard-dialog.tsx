"use client"

import { useState } from "react"
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
import type { Dashboard } from "@/lib/types/dashboard"
import { createDashboard } from "@/lib/api/dashboards"
import { ApiError } from "@/lib/api"

interface CreateDashboardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Quando presente, o painel nasce vinculado ao projeto (sem seleção manual). */
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
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleClose(next: boolean) {
    if (next) {
      onOpenChange(true)
      return
    }
    onOpenChange(false)
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
      const dashboard = await createDashboard({
        name: trimmed,
        description: description.trim(),
        widgets: [],
        filters: [],
        // ausente -> cria sem projeto; string -> associa (semântica aprovada)
        ...(projectId !== undefined ? { projectId } : {}),
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
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
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
            className="bg-teal-600 text-white hover:bg-teal-700"
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
