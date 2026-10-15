"use client"

import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { DashboardPage } from "@/lib/types/dashboard"
import { DashboardPageTabs } from "./dashboard-page-tabs"

interface DashboardPageBarProps {
  pages: DashboardPage[]
  activePageId: string
  /** Gestão de páginas (renomear/mover/excluir/nova) só em modo edição. */
  editing?: boolean
  onSelect: (pageId: string) => void
  onAdd?: () => void
  onRename?: (pageId: string, name: string) => void
  onMove?: (pageId: string, direction: "left" | "right") => void
  onDelete?: (pageId: string) => void
}

/**
 * Barra fixa inferior com as abas de página (padrão Power BI) do editor.
 * A marca e os controles globais de visualização (filtros, atualizar, tela
 * cheia) vivem na footer do visualizador compartilhado (DashboardFooter).
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
}: DashboardPageBarProps) {
  return (
    <footer
      data-testid="dashboard-page-bar"
      className="fixed inset-x-0 bottom-0 z-[45] border-t border-border bg-card"
    >
      <div className="flex h-12 items-center gap-2 px-3 sm:px-4">
        <span className="hidden shrink-0 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase sm:block">
          SIGDATA
        </span>

        <DashboardPageTabs
          pages={pages}
          activePageId={activePageId}
          editing={editing}
          onSelect={onSelect}
          onRename={onRename}
          onMove={onMove}
          onDelete={onDelete}
        />

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
