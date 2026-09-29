"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
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
import type { DashboardFilter } from "@/lib/types/dashboard"
import type { Analysis } from "@/lib/types/analysis"
import type { DatasetListItem, DatasetColumn } from "@/lib/api/datasets"
import { listDatasets, getDataset, getDistinctValues } from "@/lib/api/datasets"
import { getAnalyses } from "@/lib/api/analyses"
import { ApiError } from "@/lib/api"

const OPERATORS: { value: DashboardFilter["operator"]; label: string }[] = [
  { value: "eq", label: "Igual a" },
  { value: "in", label: "Dentre" },
  { value: "gte", label: "Maior ou igual" },
  { value: "lte", label: "Menor ou igual" },
  { value: "between", label: "Entre" },
]

interface AddFilterDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (filter: Omit<DashboardFilter, "id">) => void
  existingFilters: DashboardFilter[]
  dashboardWidgetAnalysisIds: string[]
}

export function AddFilterDialog({
  open,
  onOpenChange,
  onAdd,
  existingFilters,
  dashboardWidgetAnalysisIds,
}: AddFilterDialogProps) {
  const [step, setStep] = useState<"dataset" | "column" | "config">("dataset")
  const [loading, setLoading] = useState(false)
  const [loadingColumns, setLoadingColumns] = useState(false)
  const [loadingDistinct, setLoadingDistinct] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [datasets, setDatasets] = useState<DatasetListItem[]>([])
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [selectedDataset, setSelectedDataset] = useState<DatasetListItem | null>(null)

  const [columns, setColumns] = useState<DatasetColumn[]>([])
  const [selectedColumn, setSelectedColumn] = useState<string>("")

  const [operator, setOperator] = useState<DashboardFilter["operator"]>("eq")
  const [defaultValue, setDefaultValue] = useState<string | string[]>([])
  const [distinctValues, setDistinctValues] = useState<string[]>([])
  const [scope, setScope] = useState<"dashboard" | string[]>("dashboard")
  const [scopeWidgetIds, setScopeWidgetIds] = useState<string[]>([])

  const analysesInDashboard = analyses.filter((a) =>
    dashboardWidgetAnalysisIds.includes(a.id)
  )

  const datasetsInDashboard = datasets.filter((ds) =>
    analysesInDashboard.some((a) => a.datasetId === ds.id)
  )

  const relevantDatasets = datasetsInDashboard.length > 0 ? datasetsInDashboard : datasets

  const reset = useCallback(() => {
    setStep("dataset")
    setSelectedDataset(null)
    setColumns([])
    setSelectedColumn("")
    setOperator("eq")
    setDefaultValue([])
    setDistinctValues([])
    setLoadingColumns(false)
    setScope("dashboard")
    setScopeWidgetIds([])
    setError(null)
  }, [])

  useEffect(() => {
    if (!open) {
      requestAnimationFrame(() => reset())
      return
    }

    async function load() {
      setLoading(true)
      try {
        const [data, analysisList] = await Promise.all([
          listDatasets(),
          getAnalyses(),
        ])
        setDatasets(data.result ?? [])
        setAnalyses(analysisList)
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? err.detail
            : "Erro ao carregar datasets e análises."
        setError(msg)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [open, reset])

  useEffect(() => {
    if (!selectedDataset || !selectedColumn) {
      requestAnimationFrame(() => setDistinctValues([]))
      return
    }

    let cancelled = false
    async function load() {
      setLoadingDistinct(true)
      try {
        const res = await getDistinctValues(selectedDataset!.id, selectedColumn)
        if (!cancelled) {
          setDistinctValues(res.result ?? [])
        }
      } catch {
        if (!cancelled) setDistinctValues([])
      } finally {
        if (!cancelled) setLoadingDistinct(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [selectedDataset, selectedColumn])

  function handleSelectDataset(dataset: DatasetListItem) {
    setSelectedDataset(dataset)
    setSelectedColumn("")
    setStep("column")
    setLoadingColumns(true)

    getDataset(dataset.id)
      .then((detail) => {
        setColumns(detail.columns?.filter((c) => c.filterable) ?? [])
      })
      .catch(() => {
        setColumns([])
      })
      .finally(() => setLoadingColumns(false))
  }

  function handleSelectColumn(colName: string) {
    setSelectedColumn(colName)
    setOperator("eq")
    setDefaultValue([])
    setStep("config")
  }

  function handleAdd() {
    if (!selectedDataset || !selectedColumn) return

    const hasExistingColumnFilter = existingFilters.some(
      (f) => f.datasetId === selectedDataset.id && f.column === selectedColumn
    )

    let effectiveScope: "dashboard" | string[] = scope
    if (hasExistingColumnFilter) {
      const widgetIds = analysesInDashboard
        .filter((a) => a.datasetId === selectedDataset.id)
        .map((a) => a.id)
      effectiveScope = widgetIds.length > 0 ? widgetIds : "dashboard"
    }

    onAdd({
      datasetId: selectedDataset.id,
      column: selectedColumn,
      operator,
      defaultValue,
      scope: effectiveScope,
    })

    onOpenChange(false)
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) reset()
    onOpenChange(nextOpen)
  }

  const isValid = selectedDataset && selectedColumn && operator

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar filtro</DialogTitle>
          <DialogDescription>
            Configure um filtro que será aplicado aos widgets do painel.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {step === "dataset" && (
              <>
                <Label>1. Selecione o dataset</Label>
                <div className="max-h-48 space-y-1.5 overflow-y-auto">
                  {relevantDatasets.map((ds) => (
                    <button
                      key={ds.id}
                      type="button"
                      onClick={() => handleSelectDataset(ds)}
                      className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm transition hover:border-teal-200 hover:bg-teal-50/50 cursor-pointer"
                    >
                      <span className="font-medium text-slate-900">{ds.table_name}</span>
                      <span className="text-xs text-slate-500">{ds.database?.database_name}</span>
                    </button>
                  ))}
                  {relevantDatasets.length === 0 && (
                    <p className="py-4 text-center text-xs text-slate-500">
                      Nenhum dataset encontrado. Crie uma análise vinculada a um dataset primeiro.
                    </p>
                  )}
                </div>
              </>
            )}

            {step === "column" && selectedDataset && (
              <>
                <div className="flex items-center gap-2">
                  <Label>2. Selecione a coluna</Label>
                  <button
                    type="button"
                    onClick={() => setStep("dataset")}
                    className="text-xs text-teal-600 hover:underline cursor-pointer"
                  >
                    (trocar dataset)
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  Dataset: <span className="font-medium">{selectedDataset.table_name}</span>
                </p>
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {loadingColumns ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 size={16} className="animate-spin text-slate-400" />
                    </div>
                  ) : columns.length === 0 ? (
                    <p className="py-4 text-center text-xs text-slate-500">
                      Nenhuma coluna filtrável neste dataset.
                    </p>
                  ) : (
                    columns.map((col) => (
                      <button
                        key={col.column_name}
                        type="button"
                        onClick={() => handleSelectColumn(col.column_name)}
                        className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm transition hover:border-teal-200 hover:bg-teal-50/50 cursor-pointer"
                      >
                        <span className="font-mono text-slate-900">{col.column_name}</span>
                        <span className="text-xs text-slate-500">{col.type}</span>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}

            {step === "config" && selectedDataset && (
              <>
                <div className="flex items-center gap-2">
                  <Label>3. Configure o filtro</Label>
                  <button
                    type="button"
                    onClick={() => setStep("column")}
                    className="text-xs text-teal-600 hover:underline cursor-pointer"
                  >
                    (trocar coluna)
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  Dataset: <span className="font-medium">{selectedDataset.table_name}</span>
                  {" → "}
                  <span className="font-mono">{selectedColumn}</span>
                </p>

                <div className="space-y-2">
                  <Label>Operador</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {OPERATORS.map((op) => (
                      <button
                        key={op.value}
                        type="button"
                        onClick={() => {
                          setOperator(op.value)
                          setDefaultValue([])
                        }}
                        className={`rounded-md border px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
                          operator === op.value
                            ? "border-teal-300 bg-teal-50 text-teal-700"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        {op.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Valor padrão</Label>
                  {loadingDistinct ? (
                    <div className="flex items-center gap-2 py-2 text-xs text-slate-500">
                      <Loader2 size={14} className="animate-spin" />
                      Carregando valores...
                    </div>
                  ) : operator === "in" ? (
                    <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                      {distinctValues.length > 0 ? (
                        distinctValues.map((v) => (
                          <label
                            key={v}
                            className="flex cursor-pointer items-center gap-2 text-xs text-slate-700"
                          >
                            <input
                              type="checkbox"
                              checked={Array.isArray(defaultValue) && defaultValue.includes(v)}
                              onChange={(e) => {
                                const arr = Array.isArray(defaultValue) ? [...defaultValue] : []
                                if (e.target.checked) {
                                  arr.push(v)
                                } else {
                                  arr.splice(arr.indexOf(v), 1)
                                }
                                setDefaultValue(arr)
                              }}
                              className="rounded border-slate-300"
                            />
                            <span className="truncate">{v}</span>
                          </label>
                        ))
                      ) : (
                        <div className="space-y-2">
                          {Array.isArray(defaultValue) &&
                            defaultValue.map((v, i) => (
                              <div key={i} className="flex items-center gap-2">
                                <Input
                                  value={v}
                                  onChange={(e) => {
                                    const arr = [...defaultValue]
                                    arr[i] = e.target.value
                                    setDefaultValue(arr)
                                  }}
                                  className="h-7 text-xs"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const arr = [...defaultValue]
                                    arr.splice(i, 1)
                                    setDefaultValue(arr)
                                  }}
                                  className="text-xs text-red-500 hover:underline cursor-pointer"
                                >
                                  Remover
                                </button>
                              </div>
                            ))}
                          <button
                            type="button"
                            onClick={() => {
                              const arr = Array.isArray(defaultValue) ? [...defaultValue] : []
                              arr.push("")
                              setDefaultValue(arr)
                            }}
                            className="text-xs text-teal-600 hover:underline cursor-pointer"
                          >
                            + Adicionar valor
                          </button>
                        </div>
                      )}
                    </div>
                  ) : operator === "between" ? (
                    <div className="flex gap-2">
                      <Input
                        type="date"
                        value={Array.isArray(defaultValue) ? defaultValue[0] ?? "" : ""}
                        onChange={(e) => {
                          const arr = Array.isArray(defaultValue)
                            ? [...defaultValue]
                            : ["", ""]
                          arr[0] = e.target.value
                          setDefaultValue(arr)
                        }}
                        className="h-8 text-xs"
                      />
                      <span className="self-center text-xs text-slate-500">até</span>
                      <Input
                        type="date"
                        value={Array.isArray(defaultValue) ? defaultValue[1] ?? "" : ""}
                        onChange={(e) => {
                          const arr = Array.isArray(defaultValue)
                            ? [...defaultValue]
                            : ["", ""]
                          arr[1] = e.target.value
                          setDefaultValue(arr)
                        }}
                        className="h-8 text-xs"
                      />
                    </div>
                  ) : operator === "gte" || operator === "lte" ? (
                    <Input
                      type="date"
                      value={typeof defaultValue === "string" ? defaultValue : ""}
                      onChange={(e) => setDefaultValue(e.target.value)}
                      className="h-8 text-xs"
                    />
                  ) : (
                    <>
                      {distinctValues.length > 0 ? (
                        <select
                          value={typeof defaultValue === "string" ? defaultValue : ""}
                          onChange={(e) => setDefaultValue(e.target.value)}
                          className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs"
                        >
                          <option value="">Nenhum (mostrar todos)</option>
                          {distinctValues.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Input
                          placeholder="Valor"
                          value={typeof defaultValue === "string" ? defaultValue : ""}
                          onChange={(e) => setDefaultValue(e.target.value)}
                          className="h-8 text-xs"
                        />
                      )}
                    </>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Escopo</Label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setScope("dashboard")}
                      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
                        scope === "dashboard"
                          ? "border-teal-300 bg-teal-50 text-teal-700"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      Dashboard
                    </button>
                    <button
                      type="button"
                      onClick={() => setScope([])}
                      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
                        scope !== "dashboard"
                          ? "border-teal-300 bg-teal-50 text-teal-700"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      Widgets específicos
                    </button>
                  </div>
                  {scope !== "dashboard" && (
                    <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                      {analysesInDashboard.map((a) => (
                        <label
                          key={a.id}
                          className="flex cursor-pointer items-center gap-2 text-xs text-slate-700"
                        >
                          <input
                            type="checkbox"
                            checked={scopeWidgetIds.includes(a.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setScopeWidgetIds([...scopeWidgetIds, a.id])
                              } else {
                                setScopeWidgetIds(scopeWidgetIds.filter((id) => id !== a.id))
                              }
                            }}
                            className="rounded border-slate-300"
                          />
                          <span className="truncate">{a.name}</span>
                        </label>
                      ))}
                      {analysesInDashboard.length === 0 && (
                        <p className="py-2 text-center text-xs text-slate-500">
                          Nenhuma análise neste painel.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          {step === "config" && (
            <Button
              onClick={handleAdd}
              disabled={!isValid}
              className="bg-teal-600 text-white hover:bg-teal-700"
            >
              Adicionar filtro
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
