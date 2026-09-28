"use client"

import { useEffect, useRef, useState } from "react"
import { AlertCircle, Loader2 } from "lucide-react"
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
import { ProjectSelect } from "@/components/project/project-select"
import { getProjects } from "@/lib/api/projects"
import type { Project } from "@/lib/types/project"

interface SaveAnalysisDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Sucesso/falha são decididos pelo chamador: ele fecha o diálogo no sucesso e
   * expõe `error`. Em caso de rejeição os campos são preservados.
   */
  onSave: (
    name: string,
    description: string,
    projectId: string | null
  ) => void | Promise<void>
  title?: string
  dialogDescription?: string
  saving?: boolean
  error?: string | null
  /** Pré-seleciona o projeto ao abrir (URL `?projectId=` ou projeto da análise em edição). */
  defaultProjectId?: string | null
  /** Nome/descrição pré-preenchidos ao editar análise existente. */
  initialName?: string
  initialDescription?: string
}

export function SaveAnalysisDialog({
  open,
  onOpenChange,
  onSave,
  title = "Salvar análise",
  dialogDescription = "Dê um nome para esta análise para encontrá-la facilmente depois.",
  saving = false,
  error = null,
  defaultProjectId = null,
  initialName = "",
  initialDescription = "",
}: SaveAnalysisDialogProps) {
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)
  const [projectId, setProjectId] = useState<string | null>(defaultProjectId)
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [projectsError, setProjectsError] = useState(false)
  const savingRef = useRef(false)
  const projectsLoadedRef = useRef(false)

  // Busca lazy na primeira abertura: o diálogo abre por prop programática
  // (sem passar pelo handler do Base UI), então o gatilho é o efeito. O
  // setState acontece só em callbacks de promise (lint-safe) e não há refetch
  // em reaberturas nem request no carregamento do /explorar.
  useEffect(() => {
    if (!open || projectsLoadedRef.current) return
    projectsLoadedRef.current = true
    getProjects()
      .then(setProjects)
      .catch(() => setProjectsError(true))
  }, [open])

  function resetFields() {
    setName(initialName)
    setDescription(initialDescription)
    setProjectId(defaultProjectId)
  }

  async function handleSave() {
    const trimmed = name.trim()
    if (!trimmed || saving || savingRef.current) return

    savingRef.current = true
    try {
      await onSave(trimmed, description.trim(), projectId)
      resetFields()
    } catch {
      // o chamador controla `error`; campos do usuário permanecem
    } finally {
      savingRef.current = false
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && saving) return
    if (!nextOpen) resetFields()
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="analysis-name">Nome *</Label>
            <Input
              id="analysis-name"
              placeholder="Ex: Atendimentos por município"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void handleSave()
                }
              }}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="analysis-description">Descrição</Label>
            <Input
              id="analysis-description"
              placeholder="Ex: Total de atendimentos agrupados por município."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="analysis-project">Projeto (opcional)</Label>
            <ProjectSelect
              id="analysis-project"
              value={projectId}
              onChange={setProjectId}
              projects={projects ?? []}
              loading={projects === null && !projectsError}
              disabled={saving}
            />
            {projectsError && (
              <p className="text-xs text-slate-500">
                Não foi possível carregar os projetos — você pode salvar sem
                projeto e vincular depois.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={!name.trim() || saving}
            className="bg-teal-600 text-white hover:bg-teal-700"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            <AlertCircle size={16} />
            {error}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
