"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronDown, ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { DashboardPage } from "@/lib/types/dashboard"

interface DashboardPageBarProps {
  pages: DashboardPage[]
  activePageId: string
  /** Gestão de páginas (renomear/mover/excluir/nova) só em modo edição. */
  editing?: boolean
  onSelect: (pageId: string) => void
  /** Ações do dashboard - mostradas tanto em visualização como em edição. */
  onUpdate?: () => void
  onShare?: () => void
  /** Editar dashboard - somente quando o usuário tem permissão. */
  onEdit?: () => void
  onAdd?: () => void
  onRename?: (pageId: string, name: string) => void
  onMove?: (pageId: string, direction: "left" | "right") => void
  onDelete?: (pageId: string) => void
}

/**
 * Barra fixa inferior com as abas de página (padrão Power BI).
 * Contains dois grupos: Ações (sempre visíveis quando disponíveis) e
 * navegação entre páginas. O SIGDATA aparece no cabeçalho, não na footer.
 */
export function DashboardPageBar({
  pages,
  activePageId,
  editing = false,
  onSelect,
  onAdd,
  onRename,
  onMove,
  onDelete,
  onUpdate,
  onShare,
  onEdit,
}: DashboardPageBarProps) {
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
    <footer
      data-testid="dashboard-page-bar"
      className="fixed inset-x-0 bottom-0 z-[45] border-t border-border bg-card"
    >
      <div className="flex h-12 items-center gap-2 px-3 sm:px-4">
        <span className="hidden shrink-0 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase sm:block">
          SIGDATA
        </span>

        {/* Ações: Atualizar, Compartilhar, Editar */}
        <div className="flex items-center gap-3">
          {/* Atualizar - atualiza dados dos widgets */}
          {onUpdate && (
            <Button
              variant="outline"
              size="sm"
              title="Atualizar dados"
              aria-label="Atualizar dados"
            >
              <RefreshCw size={14} />
              Atualizar
            </Button>
          )}

          {/* Compartilhar - abre diálogo de compartilhamento */}
          {onShare && (
            <Button
              variant="outline"
              size="sm"
              title="Compartilhar"
              aria-label="Compartilhar painel"
            >
              <Share2 size={14} />
              Compartilhar
            </Button>
          )}

          {/* Editar - somente quando o usuário tem permissão */}
          {onEdit && (
            <Button
              variant="ghost"
              size="sm"
              title="Editar dashboard"
              aria-label="Editar dashboard"
            >
              <Pencil size={13} />
              Editar
            </Button>
          )}
        </div>

        <nav
          aria-label="Páginas do painel"
          className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
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

        {/* Ações adicionais em modo edição: Nova página */}
        {editing && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 shrink-0"
            onClick={() => onAdd?.()}
            title="Adicionar página"
          >
            <Plus size={14} />
            Nova página
          </Button>
        )}
      </div>
    </footer>
  )
}