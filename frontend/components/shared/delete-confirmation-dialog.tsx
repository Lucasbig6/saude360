"use client"

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

interface DeleteConfirmationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  itemName: string
  description?: string
  confirmLabel?: string
  loading?: boolean
  error?: string | null
  onConfirm: () => void
}

export function DeleteConfirmationDialog({
  open,
  onOpenChange,
  title,
  itemName,
  description,
  confirmLabel = "Excluir",
  loading = false,
  error = null,
  onConfirm,
}: DeleteConfirmationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ??
              `Tem certeza que deseja excluir "${itemName}"? Esta ação não pode ser desfeita.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive mt-2">
            <AlertCircle size={16} />
            {error}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
