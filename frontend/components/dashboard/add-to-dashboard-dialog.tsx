"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle, BarChart3, Loader2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Analysis } from "@/lib/types/analysis"
import type { Dashboard, DashboardWidget } from "@/lib/types/dashboard"
import { legacyToWidgetConfig } from "@/lib/types/widgets"
import {
  getDashboards,
  createDashboard,
  updateDashboard,
  toDashboardPayload,
} from "@/lib/api/dashboards"
import { ApiError } from "@/lib/api"

interface AddToDashboardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  analysis: Analysis | null
}

function createWidget(analysis: Analysis): DashboardWidget {
  return {
    id: crypto.randomUUID(),
    analysisId: analysis.id,
    layout: { x: 0, y: Infinity, w: 6, h: 4 },
    config: legacyToWidgetConfig(analysis),
  }
}

export function AddToDashboardDialog({
  open,
  onOpenChange,
  analysis,
}: AddToDashboardDialogProps) {
  const router = useRouter()
  const [createMode, setCreateMode] = useState(false)
  const [newName, setNewName] = useState("")
  const [feedback, setFeedback] = useState<string | null>(null)

  const [dashboards, setDashboards] = useState<Dashboard[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setLoadError(null)
      setDashboards(null)
      try {
        const list = await getDashboards()
        if (!cancelled) setDashboards(list)
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof ApiError
              ? err.detail
              : "Erro ao carregar dashboards."
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [open, reloadKey])

  const alreadyIn = useMemo(() => {
    if (!analysis) return new Set<string>()
    return new Set(
      (dashboards ?? [])
        .filter((d) => d.widgets.some((w) => w.analysisId === analysis.id))
        .map((d) => d.id)
    )
  }, [analysis, dashboards])

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setCreateMode(false)
      setNewName("")
      setFeedback(null)
      setActionError(null)
    }
    onOpenChange(nextOpen)
  }

  async function addWidgetToDashboard(dashboard: Dashboard) {
    if (!analysis || saving) return
    if (dashboard.widgets.some((w) => w.analysisId === analysis.id)) {
      setFeedback(`Já está em "${dashboard.name}".`)
      return
    }

    setSaving(true)
    setActionError(null)

    const updated: Dashboard = {
      ...dashboard,
      widgets: [...dashboard.widgets, createWidget(analysis)],
    }

    try {
      await updateDashboard(dashboard.id, toDashboardPayload(updated))
      handleOpenChange(false)
      router.push(`/paineis/${dashboard.id}`)
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.detail
          : "Erro ao adicionar ao painel."
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleCreate() {
    const trimmed = newName.trim()
    if (!trimmed || !analysis || saving) return

    setSaving(true)
    setActionError(null)

    try {
      const dashboard = await createDashboard({
        name: trimmed,
        description: "",
        widgets: [createWidget(analysis)],
        filters: [],
      })
      handleOpenChange(false)
      router.push(`/paineis/${dashboard.id}`)
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.detail : "Erro ao criar o painel."
      )
    } finally {
      setSaving(false)
    }
  }

  if (!analysis) return null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar ao painel</DialogTitle>
          <DialogDescription>
            Escolha um dashboard existente ou crie um novo para receber o
            gráfico &quot;{analysis.name}&quot;.
          </DialogDescription>
        </DialogHeader>

        {feedback && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {feedback}
          </p>
        )}

        {actionError && (
          <p className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            <AlertCircle size={14} className="shrink-0" />
            {actionError}
          </p>
        )}

        {!createMode ? (
          <div className="space-y-2 py-1">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={20} className="animate-spin text-slate-400" />
              </div>
            ) : loadError ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-center">
                <p className="text-xs text-amber-800">{loadError}</p>
                <button
                  type="button"
                  onClick={() => setReloadKey((key) => key + 1)}
                  className="mt-2 text-xs font-medium text-amber-900 underline"
                >
                  Tentar novamente
                </button>
              </div>
            ) : !dashboards || dashboards.length === 0 ? (
              <p className="text-sm text-slate-500">
                Nenhum dashboard criado ainda.
              </p>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {dashboards.map((d) => {
                  const inThis = alreadyIn.has(d.id)
                  return (
                    <button
                      key={d.id}
                      type="button"
                      disabled={inThis || saving}
                      onClick={() => void addWidgetToDashboard(d)}
                      className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-teal-200 hover:bg-teal-50/50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                        {saving && !inThis ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <BarChart3 size={16} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {d.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {d.widgets.length} widget
                          {d.widgets.length !== 1 ? "s" : ""}
                          {inThis ? " · já contém este gráfico" : ""}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            <button
              type="button"
              onClick={() => setCreateMode(true)}
              className="flex w-full items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-white p-3 text-left text-sm text-slate-600 transition hover:border-teal-300 hover:text-teal-700"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                <Plus size={16} />
              </div>
              Novo dashboard
            </button>
          </div>
        ) : (
          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <Label htmlFor="new-dashboard-name">Nome do dashboard *</Label>
              <Input
                id="new-dashboard-name"
                placeholder="Ex: Indicadores SUS"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    void handleCreate()
                  }
                }}
                autoFocus
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCreateMode(false)}
            >
              Voltar
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          {createMode && (
            <Button
              onClick={() => void handleCreate()}
              disabled={!newName.trim() || saving}
              className="bg-teal-600 text-white hover:bg-teal-700"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              <Plus size={14} />
              Criar e adicionar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
