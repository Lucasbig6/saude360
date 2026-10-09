"use client"

import { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface ExploreShellProps {
  /** Painel esquerdo: fontes e análises que formam o contexto. */
  left?: ReactNode
  header?: ReactNode
  children: ReactNode
  /** Classes extras para a coluna central (ex.: ocultar no mobile). */
  centerClassName?: string
  /** Classes extras para o container principal. */
  className?: string
}

/**
 * Layout de workspace do Explorar:
 * - Em xl: 2 colunas — Contexto (esq), Workspace (centro)
 * - Em <xl: coluna única — workspace com contexto como drawer
 * - O `children` mantém a área central de interação (abas SQL/IA/Visual).
 */
export function ExploreShell({
  left,
  header,
  children,
  centerClassName,
  className,
}: ExploreShellProps) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      {header}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-x-hidden md:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)]">
        {left && (
          <aside
            className={cn(
              "hidden border-r border-border bg-card/50 md:block",
              "overflow-y-auto"
            )}
            aria-label="Contexto da investigação"
          >
            {left}
          </aside>
        )}
        <div
          className={cn(
            "min-h-0 min-w-0 flex-1 overflow-visible",
            centerClassName
          )}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
