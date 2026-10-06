import * as React from "react"
import type { LucideIcon } from "lucide-react"
import { cn } from "cn"

interface EmptyStateProps extends React.ComponentProps<"div"> {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}

/**
 * Estado vazio padrão: função antes de decoração —
 * ícone discreto em superfície neutra, título curto e ação opcional.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center",
        className
      )}
      {...props}
    >
      {Icon && (
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <Icon size={20} className="text-muted-foreground" />
        </div>
      )}
      <h2 className="mt-4 text-sm font-semibold text-foreground">{title}</h2>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
