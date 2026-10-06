"use client"

import { useState } from "react"
import { Check, Copy, Link2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Dashboard } from "@/lib/types/dashboard"
import { getDashboardSharePath } from "@/lib/utils"

interface ShareDashboardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dashboard: Dashboard | null
}

export function ShareDashboardDialog({
  open,
  onOpenChange,
  dashboard,
}: ShareDashboardDialogProps) {
  const [copied, setCopied] = useState(false)

  if (!dashboard) return null

  const path = getDashboardSharePath(dashboard)
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const url = origin ? `${origin}${path}` : path

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const el = document.createElement("textarea")
      el.value = url
      document.body.appendChild(el)
      el.select()
      document.execCommand("copy")
      document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Compartilhar painel</DialogTitle>
          <DialogDescription>
            Qualquer pessoa com o link poderá visualizar o painel.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-1">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
            <Link2 size={15} className="shrink-0 text-muted-foreground" />
            <input
              readOnly
              value={url}
              className="w-full bg-transparent text-sm text-foreground outline-none"
              aria-label="URL do painel"
              onFocus={(e) => e.currentTarget.select()}
            />
          </div>
          <p className="text-xs text-muted-foreground">{path}</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button
            onClick={handleCopy}
          >
            {copied ? (
              <>
                <Check size={14} />
                Link copiado
              </>
            ) : (
              <>
                <Copy size={14} />
                Copiar link
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
