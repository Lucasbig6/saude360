"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import {
  AlertCircle,
  ArrowLeft,
  ChevronRight,
  Code2,
  Database,
  FileStack,
  FileText,
  FolderOpen,
  Inbox,
  Loader2,
  Search,
  Table,
  Table2,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  getSource,
  getSourceDatasets,
  deleteSource,
  getSourceTypeConfig,
  type SourceDetail,
  type TableItem,
} from "@/lib/api/sources"
import { datasetDisplayName } from "@/lib/api/datasets"
import { ApiError } from "@/lib/api"
import { useSchemaBrowser } from "@/components/sources/use-schema-browser"
import { DeleteConfirmationDialog } from "@/components/shared/delete-confirmation-dialog"

const ICONS: Record<string, typeof Database> = {
  Database,
  FileText,
  Table,
  FileStack,
}

interface DatasetItem {
  id: number
  table_name: string
  schema: string
  description?: string | null
}

interface DatasetsResponse {
  count: number
  result: DatasetItem[]
}

export default function FonteDetailPage() {
  const params = useParams()
  const router = useRouter()
  const sourceId = Number(params.id)

  const [source, setSource] = useState<SourceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const {
    schemas,
    schemasLoading,
    schemasError,
    expandedSchemas,
    schemaTables,
    loadingSchemas,
    toggleSchema,
  } = useSchemaBrowser(sourceId)

  const [datasets, setDatasets] = useState<DatasetItem[]>([])
  const [datasetsLoading, setDatasetsLoading] = useState(true)
  const [datasetsError, setDatasetsError] = useState<string | null>(null)

  const [search, setSearch] = useState("")

  useEffect(() => {
    async function load() {
      try {
        const data = await getSource(sourceId)
        setSource(data)
      } catch (err) {
        const msg =
          err instanceof ApiError ? err.detail : "Erro ao carregar fonte."
        setError(msg)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [sourceId])

  useEffect(() => {
    async function load() {
      try {
        const data = (await getSourceDatasets(sourceId)) as DatasetsResponse
        setDatasets(data.result ?? [])
        setDatasetsError(null)
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? err.detail
            : "Erro ao carregar datasets publicados."
        setDatasetsError(msg)
        setDatasets([])
      } finally {
        setDatasetsLoading(false)
      }
    }
    load()
  }, [sourceId])

  async function handleDelete() {
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteSource(sourceId)
      router.push("/fontes")
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.detail
          : "Erro ao excluir a fonte de dados."
      setDeleteError(msg)
      setDeleting(false)
    }
  }

  const filteredTables = (
    schemaName: string,
    tables: TableItem[]
  ): TableItem[] => {
    if (!search.trim()) return tables
    const q = search.toLowerCase()
    return tables.filter((t) => t.name.toLowerCase().includes(q))
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center p-12">
          <Loader2 size={20} className="animate-spin text-slate-400" />
        </div>
      </div>
    )
  }

  if (error || !source) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          <AlertCircle size={16} />
          {error || "Fonte não encontrada."}
        </div>
      </div>
    )
  }

  const typeConfig = getSourceTypeConfig(source.engine)
  const Icon = ICONS[typeConfig.icon] ?? Database
  const isFileSource = !typeConfig.needsConnection

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <section>
        <Link
          href="/fontes"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-600 transition-colors"
        >
          <ArrowLeft size={14} />
          Voltar às Fontes
        </Link>

        <div className="mt-3 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
              <Icon size={20} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                {source.database_name}
              </h1>
              <p className="mt-0.5 text-sm text-slate-500">
                {typeConfig.label}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isFileSource && (
              <Link href={`/fontes/${sourceId}/preparar`}>
                <Button
                  size="sm"
                  className="bg-teal-600 text-white hover:bg-teal-700"
                >
                  <Code2 size={14} />
                  Preparar
                </Button>
              </Link>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteOpen(true)}
              className="text-slate-500 hover:text-red-600"
            >
              <Trash2 size={14} />
              Excluir
            </Button>
          </div>
        </div>
      </section>

      {/* File source placeholder */}
      {isFileSource && (
        <section className="mt-8">
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <FileStack size={24} className="text-slate-400" />
            </div>
            <h2 className="mt-4 text-sm font-semibold text-slate-900">
              Preparação de dados
            </h2>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              O upload e a preparação de arquivos {typeConfig.label} serão
              disponibilizados em uma próxima versão.
            </p>
          </div>
        </section>
      )}

      {/* Tabelas disponíveis */}
      {!isFileSource && (
        <section className="mt-8">
          <h2 className="text-base font-semibold text-slate-900">
            Tabelas disponíveis
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Selecione uma tabela para preparar e publicar como dataset.
          </p>

          {/* Search */}
          <div className="mt-4 relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <Input
              placeholder="Buscar tabela..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Schemas */}
          {schemasLoading ? (
            <div className="mt-4 flex items-center justify-center p-8">
              <Loader2 size={20} className="animate-spin text-slate-400" />
            </div>
          ) : schemasError ? (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              <AlertCircle size={16} />
              {schemasError}
            </div>
          ) : schemas.length === 0 ? (
            <div className="mt-4 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                <Inbox size={20} className="text-slate-400" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-slate-900">
                Nenhum schema encontrado
              </h3>
              <p className="mt-1 max-w-sm text-xs text-slate-500">
                Esta fonte de dados não possui schemas acessíveis.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {schemas.map((schema) => {
                const isExpanded = expandedSchemas.has(schema)
                const isLoading = loadingSchemas.has(schema)
                const tables = schemaTables[schema]
                const filtered = tables
                  ? filteredTables(schema, tables)
                  : undefined

                return (
                  <div
                    key={schema}
                    className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSchema(schema)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <FolderOpen
                        size={16}
                        className="shrink-0 text-teal-600"
                      />
                      <span className="text-sm font-medium text-slate-900">
                        {schema}
                      </span>
                      {tables && (
                        <span className="text-xs text-slate-400">
                          {tables.length} tabela{tables.length !== 1 ? "s" : ""}
                        </span>
                      )}
                      <ChevronRight
                        size={14}
                        className={`ml-auto shrink-0 text-slate-400 transition-transform ${
                          isExpanded ? "rotate-90" : ""
                        }`}
                      />
                    </button>

                    {isExpanded && (
                      <div className="border-t border-slate-100">
                        {isLoading ? (
                          <div className="flex items-center justify-center p-6">
                            <Loader2
                              size={16}
                              className="animate-spin text-slate-400"
                            />
                          </div>
                        ) : filtered && filtered.length === 0 ? (
                          <div className="px-4 py-6 text-center text-xs text-slate-400">
                            {tables && tables.length === 0
                              ? "Nenhuma tabela neste schema."
                              : "Nenhuma tabela corresponde à busca."}
                          </div>
                        ) : (
                          filtered && (
                            <div className="divide-y divide-slate-50">
                              {filtered.map((table) => (
                                <Link
                                  key={table.name}
                                   href={`/fontes/${sourceId}/preparar?table=${encodeURIComponent(
                                     `${schema}__${table.name}`
                                   )}`}
                                  className="flex items-center gap-3 px-4 py-2.5 pl-10 hover:bg-teal-50/50 transition-colors"
                                >
                                  <Table2
                                    size={14}
                                    className="shrink-0 text-slate-400"
                                  />
                                  <span className="text-sm text-slate-700">
                                    {table.name}
                                  </span>
                                  <span className="ml-auto text-xs text-slate-400">
                                    {table.type}
                                  </span>
                                </Link>
                              ))}
                            </div>
                          )
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* Datasets publicados */}
      {!isFileSource && (
        <section className="mt-8">
          <h2 className="text-base font-semibold text-slate-900">
            Datasets publicados
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Conjuntos de dados já publicados a partir desta fonte.
          </p>

          {datasetsLoading ? (
            <div className="mt-4 flex items-center justify-center p-8">
              <Loader2 size={20} className="animate-spin text-slate-400" />
            </div>
          ) : datasetsError ? (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              <AlertCircle size={16} />
              {datasetsError}
            </div>
          ) : datasets.length === 0 ? (
            <div className="mt-4 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                <Inbox size={20} className="text-slate-400" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-slate-900">
                Nenhum dataset publicado
              </h3>
              <p className="mt-1 max-w-sm text-xs text-slate-500">
                Selecione uma tabela acima e publique como dataset para
                disponibilizar no Explorar.
              </p>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {datasets.map((dataset) => (
                <Link
                  key={dataset.id}
                  href={`/explorar?datasetId=${dataset.id}`}
                >
                  <div className="group h-full rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 text-slate-600">
                        <Table2 size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold text-slate-900 truncate">
                          {datasetDisplayName(dataset)}
                        </h3>
                        <p className="text-xs text-slate-500 truncate">
                          {dataset.table_name}
                          {dataset.schema ? ` · ${dataset.schema}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                      >
                        Explorar dados
                      </Button>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Delete confirmation */}
      <DeleteConfirmationDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open)
          if (!open) setDeleteError(null)
        }}
        title="Excluir fonte"
        itemName={source.database_name}
        description={`Tem certeza que deseja excluir "${source.database_name}"? Todos os datasets associados serão removidos do Superset. Esta ação não pode ser desfeita.`}
        loading={deleting}
        error={deleteError}
        onConfirm={handleDelete}
      />
    </div>
  )
}
