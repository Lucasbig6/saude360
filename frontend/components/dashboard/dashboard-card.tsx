"use client"

import Link from "next/link"
import { BarChart3, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Dashboard } from "@/lib/types/dashboard"
import { formatDateTime } from "@/lib/format"
import { dashboardHref } from "@/lib/routes"

interface DashboardCardProps {
  dashboard: Dashboard
  onDelete?: (dashboard: Dashboard) => void
  /** Nome do projeto de destino (biblioteca global). */
  projectName?: string | null
}

export function DashboardCard({
  dashboard,
  onDelete,
  projectName,
}: DashboardCardProps) {
  return (
    <div className="group rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <BarChart3 size={18} />
        </div>
        <Badge variant="secondary">
          {dashboard.widgets.length} widget
          {dashboard.widgets.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      <h3 className="mt-3 text-sm font-semibold text-foreground line-clamp-1">
        {dashboard.name}
      </h3>

      {dashboard.description && (
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
          {dashboard.description}
        </p>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        {projectName !== undefined && (
          <span className="block truncate">
            {projectName ? projectName : "Sem projeto"}
          </span>
        )}
        Atualizado em {formatDateTime(dashboard.updatedAt)}
      </p>

      <div className="mt-4 flex items-center gap-2">
        <Link href={dashboardHref(dashboard)} className="flex-1">
          <Button variant="outline" size="sm" className="w-full">
            Abrir
          </Button>
        </Link>
        {onDelete && (
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onDelete(dashboard)}
            className="shrink-0 text-muted-foreground hover:text-destructive"
          >
            <Trash2 size={14} />
          </Button>
        )}
      </div>
    </div>
  )
}
