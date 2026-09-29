"use client"

import { use, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { AlertCircle, FileChartColumn, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Dashboard } from "@/lib/types/dashboard"
import { getDashboardBySlug } from "@/lib/api/dashboards"
import { ApiError } from "@/lib/api"
import { isAuthenticated } from "@/lib/auth"
import { DashboardViewer } from "@/components/dashboard/dashboard-viewer"

export default function PainelViewerPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)

  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const loadedRef = useRef(false)

  // GET público por slug: sem token e sem localStorage.
  // Sem flag `cancelled`: o guard de loadedRef + cancelamento travaria o
  // carregamento no Strict Mode do dev (2ª execução cedo, 1ª descartada).
  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true

    let edit = false
    try {
      edit = isAuthenticated()
    } catch {
      edit = false
    }

    getDashboardBySlug(slug)
      .then((value) => {
        setCanEdit(edit)
        setDashboard(value)
        setLoaded(true)
      })
      .catch((err) => {
        setCanEdit(edit)
        setLoadError(
          err instanceof ApiError
            ? err.detail
            : "Não foi possível carregar o painel."
        )
        setLoaded(true)
      })
  }, [slug, reloadKey])

  function handleRetry() {
    loadedRef.current = false
    setDashboard(null)
    setLoadError(null)
    setLoaded(false)
    setReloadKey((tick) => tick + 1)
  }

  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">Carregando painel...</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
            <AlertCircle size={24} className="text-red-500" />
          </div>
          <h1 className="mt-4 text-lg font-semibold text-slate-900">
            Não foi possível carregar o painel
          </h1>
          <p className="mt-2 text-sm text-slate-500">{loadError}</p>
          <div className="mt-6 flex justify-center">
            <Button variant="outline" onClick={handleRetry}>
              <RefreshCw size={14} />
              Tentar novamente
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (!dashboard) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
            <FileChartColumn size={24} className="text-slate-400" />
          </div>
          <h1 className="mt-4 text-lg font-semibold text-slate-900">
            Painel não encontrado
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            O link pode estar incorreto ou o painel ainda não foi criado.
          </p>
          <div className="mt-6">
            <Link href="/login">
              <Button variant="outline">Ir para o Saude360</Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <DashboardViewer
      dashboard={dashboard}
      canEdit={canEdit}
      editHref={`/paineis/${dashboard.id}`}
      // IA só com sessão autenticada: o painel público anônimo não expõe o copiloto.
      enableCopilot={canEdit}
    />
  )
}
