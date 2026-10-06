"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { AlertCircle, ArrowLeft, FileChartColumn, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"
import type { Dashboard } from "@/lib/types/dashboard"
import { getDashboard } from "@/lib/api/dashboards"
import { ApiError } from "@/lib/api"
import { DashboardBuilder } from "@/components/dashboard/dashboard-builder"
import { recordRecentId } from "@/lib/recent"

interface DashboardDetailProps {
  dashboardId: string
  /** Rota de volta (lista do projeto ou biblioteca global). */
  backHref: string
  /** Chamado assim que o dashboard carrega (usado para canonizar rotas). */
  onLoaded?: (dashboard: Dashboard) => void
}

/**
 * Carrega um dashboard pelo id e abre o builder, com os estados de carregamento,
 * erro e "não encontrado" da rota que o hospeda.
 */
export function DashboardDetail({
  dashboardId,
  backHref,
  onLoaded,
}: DashboardDetailProps) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true

    getDashboard(dashboardId)
      .then((value) => {
        setDashboard(value)
        setLoading(false)
        if (value) {
          recordRecentId("dashboard", value.id)
          onLoaded?.(value)
        }
      })
      .catch((err) => {
        setLoadError(
          err instanceof ApiError ? err.detail : "Erro ao carregar o painel."
        )
        setLoading(false)
      })
  }, [dashboardId, reloadKey, onLoaded])

  function handleRetry() {
    loadedRef.current = false
    setDashboard(null)
    setLoadError(null)
    setLoading(true)
    setReloadKey((tick) => tick + 1)
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <BackLink href={backHref} label="Painéis" />
        <div className="mt-8 flex items-center justify-center rounded-lg border border-border bg-card p-12">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <BackLink href={backHref} label="Painéis" />
        <div className="mt-8 rounded-lg border border-warning/30 bg-warning/10 px-6 py-8 text-center">
          <div className="flex items-center justify-center gap-2 text-sm font-medium text-warning">
            <AlertCircle size={16} />
            {loadError}
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRetry}>
              <RefreshCw size={13} />
              Tentar novamente
            </Button>
            <Link href={backHref}>
              <Button variant="outline" size="sm">
                Painéis
              </Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!dashboard) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <BackLink href={backHref} label="Painéis" />
        <EmptyState
          className="mt-8"
          icon={FileChartColumn}
          title="Painel não encontrado"
          description="Este painel pode ter sido excluído ou o link está incorreto."
          action={
            <Link href={backHref}>
              <Button variant="outline">Voltar para Painéis</Button>
            </Link>
          }
        />
      </div>
    )
  }

  return <DashboardBuilder dashboard={dashboard} onDashboardChange={setDashboard} />
}

export function BackLink({
  href,
  label,
}: {
  href: string
  label: string
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
    >
      <ArrowLeft size={14} />
      {label}
    </Link>
  )
}
