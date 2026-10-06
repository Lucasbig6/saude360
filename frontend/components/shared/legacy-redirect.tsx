"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api"
import { getAnalysis } from "@/lib/api/analyses"
import { getDashboard } from "@/lib/api/dashboards"
import { getSourceProjects } from "@/lib/api/sources"

export type LegacyTarget = "analysis" | "dashboard" | "source"

interface LegacyRedirectProps {
  target: LegacyTarget
  id: string
  /** Mantém a query string atual na rota nova (ex.: `?table=` de preparar). */
  preserveSearch?: boolean
}

async function resolveHref(
  target: LegacyTarget,
  id: string,
  preserveSearch: boolean
): Promise<string> {
  const search = preserveSearch
    ? typeof window === "undefined"
      ? ""
      : window.location.search
    : ""

  if (target === "analysis") {
    const analysis = await getAnalysis(id)
    if (!analysis) throw new ApiError(404, "Análise não encontrada.")
    return analysis.projectId
      ? `/projetos/${analysis.projectId}/analises/${analysis.id}${search}`
      : `/projetos${search}`
  }

  if (target === "dashboard") {
    const dashboard = await getDashboard(id)
    if (!dashboard) throw new ApiError(404, "Painel não encontrado.")
    return dashboard.projectId
      ? `/projetos/${dashboard.projectId}/paineis/${dashboard.id}${search}`
      : `/paineis${search}`
  }

  const projects = await getSourceProjects(Number(id))
  return projects.length > 0
    ? `/projetos/${projects[0].id}/fontes/${id}${search}`
    : `/projetos${search}`
}

/**
 * Páginas legadas (`/analises/[id]`, `/paineis/[id]`, `/fontes/[id]`) que
 * precisam consultar a API para descobrir em qual projeto o item vive antes
 * de apontar para a rota aninhada. Sem projeto, caem na lista correspondente.
 */
export function LegacyRedirect({
  target,
  id,
  preserveSearch = false,
}: LegacyRedirectProps) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false

    resolveHref(target, id, preserveSearch)
      .then((href) => {
        if (!cancelled) router.replace(href)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof ApiError ? err.detail : "Item não encontrado.")
      })

    return () => {
      cancelled = true
    }
  }, [target, id, preserveSearch, router, attempt])

  if (!error) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center p-12">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        <AlertCircle size={16} className="shrink-0" />
        <span className="min-w-0 flex-1">{error}</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setError(null)
            setAttempt((value) => value + 1)
          }}
        >
          <RefreshCw size={13} />
          Tentar novamente
        </Button>
      </div>
    </div>
  )
}
