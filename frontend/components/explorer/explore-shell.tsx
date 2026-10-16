"use client"

import { ReactNode } from "react"
import { PanelLeft } from "lucide-react"
import { cn } from "@/lib/utils"

interface ExploreShellProps {
  /** Painel esquerdo: fontes e análises que formam o contexto. */
  left?: ReactNode
  header?: ReactNode
  children: ReactNode
  /**
   * Painel direito: pré-visualização persistente da análise em edição.
   * A partir de xl vira a 3ª coluna; abaixo disso quem decide é a página
   * (alternador Conversa/Resultado).
   */
  right?: ReactNode
  leftCollapsed?: boolean
  onToggleLeft?: () => void
  /** Classes extras para a coluna central (ex.: ocultar no mobile). */
  centerClassName?: string
  /** Classes extras para o container principal. */
  className?: string
}

/**
 * Layout de workspace do Explorar:
 * - Em xl: 3 colunas — Contexto (esq), Chat/Workspace (centro), Prévia (dir)
 * - Em md–xl: 2 colunas — Contexto + Workspace
 * - Em <md: coluna única — workspace com contexto como drawer
 * - O `children` mantém a área central de interação (abas SQL/IA/Visual).
 */
export function ExploreShell({
  left,
  header,
  children,
  right,
  leftCollapsed = false,
  onToggleLeft,
  centerClassName,
  className,
}: ExploreShellProps) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      {header}
      <div
        className={cn(
          "grid min-h-0 flex-1 grid-cols-1 overflow-x-hidden",
          left && !leftCollapsed && "md:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)]",
          left && leftCollapsed && "md:grid-cols-[2.75rem_minmax(0,1fr)]",
          right && left && !leftCollapsed &&
            "xl:grid-cols-[minmax(14rem,18rem)_minmax(0,1.3fr)_minmax(0,1fr)]",
          right && left && leftCollapsed &&
            "xl:grid-cols-[2.75rem_minmax(0,1.3fr)_minmax(0,1fr)]"
        )}
      >
        {left && (
          <aside
            className={cn(
              "hidden border-r border-border bg-card/50 md:flex",
              leftCollapsed
                ? "justify-center px-1 pt-3"
                : "overflow-y-auto scrollbar-thin"
            )}
            aria-label="Fontes do projeto"
          >
            {leftCollapsed ? (
              <button
                type="button"
                onClick={onToggleLeft}
                aria-label="Expandir fontes"
                title="Expandir fontes"
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <PanelLeft size={16} />
              </button>
            ) : (
              left
            )}
          </aside>
        )}
        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
            centerClassName
          )}
        >
          {children}
        </div>
        {right && (
          <aside
            className={cn(
              "hidden border-l border-border bg-card/50 xl:flex xl:flex-col",
              "min-h-0 overflow-hidden"
            )}
            aria-label="Pré-visualização da análise"
          >
            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
              {right}
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
