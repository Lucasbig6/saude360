import * as React from "react"
import { cn } from "cn"

interface PageHeaderProps extends React.ComponentProps<"section"> {
  title: string
  description?: string
  /** Conteúdo secundário (filtros, contagens, metadados) ao lado das ações. */
  meta?: React.ReactNode
  /** Ações principais/secundárias. A primária deve ser a única `variant="default"`. */
  actions?: React.ReactNode
}

/**
 * Cabeçalho padrão das páginas internas (design/components.md §1).
 * Título `text-2xl font-semibold`, descrição `text-sm` curta,
 * sem títulos gigantes nem elementos decorativos.
 */
export function PageHeader({
  title,
  description,
  meta,
  actions,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <section className={cn("flex flex-col gap-3", className)} {...props}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>

        {(actions || meta) && (
          <div className="flex flex-wrap items-center gap-2">
            {meta && (
              <span className="text-xs text-muted-foreground">{meta}</span>
            )}
            {actions}
          </div>
        )}
      </div>
    </section>
  )
}
