"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronDown, ChevronLeft, ChevronRight, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { DashboardPage } from "@/lib/types/dashboard"

interface DashboardPageTabsProps {
  pages: DashboardPage[]
  activePageId: string
  /** Gestão de páginas (renomear/mover/excluir) só em modo edição. */
  editing?: boolean
  onSelect: (pageId: string) => void
  onRename?: (pageId: string, name: string) => void
  onMove?: (pageId: string, direction: "left" | "right") => void
  onDelete?: (pageId: string) => void
  className?: string
}

/**
 * Abas de página no padrão Power BI. Extraída da barra inferior para ser
 * reutilizada tanto no editor (DashboardPageBar) quanto na footer do
 * visualizador compartilhado (DashboardFooter).
 */
export function DashboardPageTabs({
  pages,
  activePageId,
  editing = false,
  onSelect,
  onRename,
  onMove,
  onDelete,
  className,
}: DashboardPageTabsProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const renameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renamingId !== null) renameRef.current?.select()
  }, [renamingId])

  function startRename(page: DashboardPage) {
    setRenamingId(page.id)
    setRenameValue(page.name)
  }

  function commitRename() {
    if (renamingId === null) return
    const name = renameValue.trim()
    if (name) onRename?.(renamingId, name)
    setRenamingId(null)
  }

  function cancelRename() {
    setRenamingId(null)
  }

  return (
    <nav
      aria-label="Páginas do painel"
      className={cn(
        "flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto",
        className
      )}
    >
      {pages.map((page, index) => {
        const active = page.id === activePageId
        const renaming = renamingId === page.id
        return (
          <div key={page.id} className="flex shrink-0 items-center">
            {renaming ? (
              <input
                ref={renameRef}
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitRename()
                  if (event.key === "Escape") cancelRename()
                }}
                aria-label="Nome da página"
                className="h-8 w-36 rounded-md border border-primary/50 bg-background px-2 text-xs font-medium text-foreground outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => onSelect(page.id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-8 items-center rounded-md px-3 text-xs font-medium whitespace-nowrap transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {page.name}
              </button>
            )}

            {editing && !renaming && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-6 px-0"
                      title={`Opções da página ${page.name}`}
                      aria-label={`Opções da página ${page.name}`}
                    />
                  }
                >
                  <ChevronDown size={12} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center">
                  <DropdownMenuItem onClick={() => startRename(page)}>
                    <Pencil size={13} />
                    Renomear
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={index === 0}
                    onClick={() => onMove?.(page.id, "left")}
                  >
                    <ChevronLeft size={13} />
                    Mover à esquerda
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={index === pages.length - 1}
                    onClick={() => onMove?.(page.id, "right")}
                  >
                    <ChevronRight size={13} />
                    Mover à direita
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={pages.length <= 1}
                    onClick={() => onDelete?.(page.id)}
                  >
                    <Trash2 size={13} />
                    Excluir página
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )
      })}
    </nav>
  )
}
