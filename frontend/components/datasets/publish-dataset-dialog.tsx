"use client"

import { useState } from "react"
import { AlertCircle, CheckCircle, Loader2 } from "lucide-react"
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
import { ApiError } from "@/lib/api"

interface PublishDatasetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description?: string
  defaultName?: string
  successMessage?: string
  successDetail?: string
  footerInfo?: string
  onPublish: (name: string, description: string) => Promise<void>
  onSuccess?: () => void
}

export function PublishDatasetDialog({
  open,
  onOpenChange,
  title = "Salvar como Dataset",
  description = "O resultado será materializado como uma tabela reutilizável, disponível para outros usuários no Saude360.",
  defaultName = "",
  successMessage = "Dataset publicado com sucesso!",
  successDetail = "O dataset está disponível na lista de datasets do Explorar.",
  footerInfo,
  onPublish,
  onSuccess,
}: PublishDatasetDialogProps) {
  const [name, setName] = useState(defaultName)
  const [descriptionValue, setDescriptionValue] = useState("")
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  function handleClose() {
    onOpenChange(false)
    if (success) {
      setSuccess(false)
      setError(null)
      setName(defaultName)
      setDescriptionValue("")
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setName(defaultName)
      setDescriptionValue("")
      setError(null)
    }
    onOpenChange(nextOpen)
  }

  async function handlePublish() {
    const trimmed = name.trim()
    if (!trimmed) return

    setPublishing(true)
    setError(null)
    try {
      await onPublish(trimmed, descriptionValue.trim())
      setSuccess(true)
      onSuccess?.()
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.detail : "Erro ao publicar dataset."
      setError(msg)
    } finally {
      setPublishing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
              <CheckCircle size={16} />
              {successMessage}
            </div>
            <p className="text-xs text-muted-foreground">{successDetail}</p>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="publish-name">Nome *</Label>
                <Input
                  id="publish-name"
                  placeholder="Nome do dataset"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      handlePublish()
                    }
                  }}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="publish-description">Descrição</Label>
                <Input
                  id="publish-description"
                  placeholder="Descrição opcional"
                  value={descriptionValue}
                  onChange={(e) => setDescriptionValue(e.target.value)}
                />
              </div>
              {footerInfo && (
                <p className="text-xs text-muted-foreground">{footerInfo}</p>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertCircle size={16} />
                {error}
              </div>
            )}
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {success ? "Fechar" : "Cancelar"}
          </Button>
          {!success && (
            <Button
              onClick={handlePublish}
              disabled={!name.trim() || publishing}
            >
              {publishing && <Loader2 size={14} className="animate-spin" />}
              Publicar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
