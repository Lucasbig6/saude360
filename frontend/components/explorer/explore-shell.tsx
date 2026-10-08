"use client"

import { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface ExploreShellProps {
  /** Painel esquerdo: fontes e análises que formam o contexto. */
  left?: ReactNode
  /** Painel direito: resultado da investigação atual. */
  right?: ReactNode
  header?: ReactNode
  children: ReactNode
  /** Classes extras para a coluna central (ex.: ocultar no mobile). */
  centerClassName?: string
  /** Classes extras para o painel direito (ex.: ocultar no mobile). */
  rightClassName?: string
}

/**
 * Layout de workspace do Explorar: rail esquerdo, área central e painel de
 * contexto opcional. Os rails ficam ocultos abaixo de `xl` — a área central
 * mantém toda a funcionalidade (seletor de dataset incluído).
 */
export function ExploreShell({
  left,
  right,
  header,
  children,
  centerClassName,
  rightClassName,
}: ExploreShellProps) {
  return (
    <div className="flex min-h-full w-full flex-col xl:h-[calc(100dvh-4rem)]">
      {header}
      <div
        className={cn(
          "explorer-workspace grid min-h-0 flex-1 grid-cols-1 overflow-x-hidden bg-card",
          right
            ? "xl:grid-cols-[minmax(14rem,16.25rem)_minmax(0,1fr)_minmax(34rem,44rem)]"
            : "xl:grid-cols-[minmax(14rem,16.25rem)_minmax(0,1fr)]"
        )}
      >
        {left && (
          <aside className="min-h-0 border-b border-border xl:border-b-0 xl:border-r" aria-label="Contexto da investigação">
            {left}
          </aside>
        )}

        <div
          className={cn(
            "min-h-0 min-w-0 xl:overflow-y-auto",
            right ? "" : "border-b border-border",
            centerClassName
          )}
        >
          {children}
        </div>

        {right && (
          <aside
            className={cn(
              "min-h-0 border-t border-border xl:overflow-y-auto xl:border-l xl:border-t-0",
              rightClassName
            )}
            aria-label="Resultado da investigação"
          >
            {right}
          </aside>
        )}
      </div>
    </div>
  )
}
