"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { use } from "react"
import {
  AlertCircle,
  ArrowLeft,
  FileChartColumn,
  Loader2,
  RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Dashboard } from "@/lib/types/dashboard"
import { getDashboard } from "@/lib/api/dashboards"
import { ApiError } from "@/lib/api"
import { DashboardBuilder } from "@/components/dashboard/dashboard-builder"

export default function DashboardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)

  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true

    getDashboard(id)
      .then((value) => {
        setDashboard(value)
        setLoading(false)
      })
      .catch((err) => {
        setLoadError(
          err instanceof ApiError
            ? err.detail
            : "Erro ao carregar o painel."
        )
        setLoading(false)
      })
  }, [id, reloadKey])

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
        <Link
          href="/paineis"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-600 transition-colors"
        >
          <ArrowLeft size={14} />
          Painéis
        </Link>

        <div className="mt-8 flex items-center justify-center rounded-xl border border-slate-200 bg-white p-12">
          <Loader2 size={20} className="animate-spin text-slate-400" />
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href="/paineis"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-600 transition-colors"
        >
          <ArrowLeft size={14} />
          Painéis
        </Link>

        <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 px-6 py-8 text-center">
          <div className="flex items-center justify-center gap-2 text-sm font-medium text-amber-800">
            <AlertCircle size={16} />
            {loadError}
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRetry}>
              <RefreshCw size={13} />
              Tentar novamente
            </Button>
            <Link href="/paineis">
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
        <Link
          href="/paineis"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-600 transition-colors"
        >
          <ArrowLeft size={14} />
          Painéis
        </Link>

        <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
            <FileChartColumn size={24} className="text-slate-400" />
          </div>
          <h2 className="mt-4 text-sm font-semibold text-slate-900">
            Painel não encontrado
          </h2>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            Este painel pode ter sido excluído ou o link está incorreto.
          </p>
          <Link href="/paineis" className="mt-6">
            <Button variant="outline">Voltar para Painéis</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <DashboardBuilder
      dashboard={dashboard}
      onDashboardChange={setDashboard}
    />
  )
}
