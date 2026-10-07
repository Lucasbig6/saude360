"use client"

import { useEffect, useState } from "react"
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
import type { Dashboard, DashboardAppearance } from "@/lib/types/dashboard"

interface EditDashboardInfoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dashboard: Dashboard
  onSave: (data: {
    name: string
    description: string
    appearance: DashboardAppearance
  }) => void
}

export function EditDashboardInfoDialog({
  open,
  onOpenChange,
  dashboard,
  onSave,
}: EditDashboardInfoDialogProps) {
  const [name, setName] = useState(dashboard.name)
  const [description, setDescription] = useState(dashboard.description)
  const [theme, setTheme] = useState<"light" | "dark">(
    dashboard.appearance?.theme ?? "light"
  )
  const [showBrand, setShowBrand] = useState(
    dashboard.appearance?.showBrand ?? true
  )

  useEffect(() => {
    if (!open) return
    requestAnimationFrame(() => {
      setName(dashboard.name)
      setDescription(dashboard.description)
      setTheme(dashboard.appearance?.theme ?? "light")
      setShowBrand(dashboard.appearance?.showBrand ?? true)
    })
  }, [open, dashboard])

  function handleSave() {
    const trimmed = name.trim()
    if (!trimmed) return

    // spread preserva `width`, que agora é editado só na toolbar
    onSave({
      name: trimmed,
      description: description.trim(),
      appearance: { ...dashboard.appearance, theme, showBrand },
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar informações</DialogTitle>
          <DialogDescription>
            Atualize nome, descrição e aparência do painel. Os widgets são
            mantidos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label htmlFor="dashboard-edit-name">Nome *</Label>
            <Input
              id="dashboard-edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Monitoramento de Atendimentos"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dashboard-edit-description">Descrição</Label>
            <Input
              id="dashboard-edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Acompanhamento dos atendimentos no Piauí."
            />
          </div>

          <div className="space-y-2">
            <Label>Tema</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTheme("light")}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2 text-sm transition",
                  theme === "light"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-border"
                )}
              >
                Claro
              </button>
              <button
                type="button"
                onClick={() => setTheme("dark")}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2 text-sm transition",
                  theme === "dark"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-border"
                )}
              >
                Escuro
              </button>
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={showBrand}
              onChange={(e) => setShowBrand(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-primary"
            />
             Exibir marca SIGDATA
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={!name.trim()}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
