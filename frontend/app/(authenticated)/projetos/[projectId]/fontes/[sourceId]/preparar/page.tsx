"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import {
  AlertCircle,
  ArrowLeft,
  Database,
  FileStack,
  FileText,
  Loader2,
  Send,
  Table2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  getSource,
  getSourceTypeConfig,
  type SourceDetail,
} from "@/lib/api/sources"
import { executeQuery } from "@/lib/api/queries"
import { ApiError } from "@/lib/api"
import { useSchemaBrowser } from "@/components/sources/use-schema-browser"
import { ObjectBrowser } from "@/components/preparar/object-browser"
import { QueryTabs, type QueryTab } from "@/components/preparar/query-tabs"
import { QueryEditor } from "@/components/preparar/query-editor"
import { ResultPanel } from "@/components/preparar/result-panel"
import { PublishDialog } from "@/components/preparar/publish-dialog"

const ICONS: Record<string, typeof Database> = {
  Database,
  FileText,
  Table: Table2,
  FileStack,
}

interface QueryState {
  id: string
  label: string
  sql: string
  result: Record<string, unknown>[] | null
  loading: boolean
  error: string | null
}

let queryCounter = 0
function nextQueryLabel() {
  queryCounter += 1
  return `Consulta ${queryCounter}`
}

function createEmptyQuery(label?: string): QueryState {
  return {
    id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: label ?? nextQueryLabel(),
    sql: "",
    result: null,
    loading: false,
    error: null,
  }
}

function parseTableParam(raw: string | null): { schema: string; table: string } | null {
  if (!raw) return null
  const decoded = decodeURIComponent(raw)
  const idx = decoded.indexOf("__")
  if (idx === -1) return { schema: "public", table: decoded }
  return { schema: decoded.substring(0, idx), table: decoded.substring(idx + 2) }
}

export default function PrepararPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const sourceId = Number(params.id)

  const initialTable = parseTableParam(searchParams.get("table"))

  const [source, setSource] = useState<SourceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const {
    schemas,
    schemasLoading,
    schemasError,
    expandedSchemas,
    schemaTables,
    loadingSchemas,
    toggleSchema,
  } = useSchemaBrowser(sourceId, {
    initialExpanded: initialTable ? [initialTable.schema] : [],
  })

  const [selectedTable, setSelectedTable] = useState<{
    schema: string
    table: string
  } | null>(initialTable)

  const [queries, setQueries] = useState<QueryState[]>(() => {
    const first = createEmptyQuery()
    if (initialTable) {
      first.sql = `SELECT *\nFROM ${initialTable.schema}.${initialTable.table}\nLIMIT 100`
    }
    return [first]
  })
  const [activeQueryId, setActiveQueryId] = useState(queries[0].id)

  const [publishOpen, setPublishOpen] = useState(false)

  const activeQuery = queries.find((q) => q.id === activeQueryId) ?? queries[0]

  const allTables = useMemo(() => {
    const result: { schema: string; name: string }[] = []
    for (const [schema, tables] of Object.entries(schemaTables)) {
      for (const t of tables) {
        result.push({ schema, name: t.name })
      }
    }
    return result
  }, [schemaTables])

  const allColumns = useMemo(() => {
    if (!activeQuery.result || activeQuery.result.length === 0) return []
    return Object.keys(activeQuery.result[0])
  }, [activeQuery.result])

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

  const handleSelectTable = useCallback(
    (schema: string, table: string) => {
      setSelectedTable({ schema, table })
      if (!expandedSchemas.has(schema)) {
        toggleSchema(schema)
      }
    },
    [expandedSchemas, toggleSchema]
  )

  const handleInsertInEditor = useCallback(
    (schema: string, table: string) => {
      const ref = `${schema}.${table}`
      setQueries((prev) =>
        prev.map((q) =>
          q.id === activeQueryId
            ? {
                ...q,
                sql: q.sql
                  ? `${q.sql}\n-- ${ref}\n`
                  : `SELECT *\nFROM ${ref}\nLIMIT 100`,
              }
            : q
        )
      )
    },
    [activeQueryId]
  )

  const handleExecute = useCallback(async () => {
    const sql = activeQuery.sql.trim()
    if (!sql) return

    setQueries((prev) =>
      prev.map((q) =>
        q.id === activeQueryId
          ? { ...q, loading: true, error: null, result: null }
          : q
      )
    )

    try {
      const result = await executeQuery({
        database_id: sourceId,
        sql,
      })
      if (result.status === "error") {
        setQueries((prev) =>
          prev.map((q) =>
            q.id === activeQueryId
              ? { ...q, loading: false, error: result.message || "Erro ao executar consulta." }
              : q
          )
        )
      } else {
        setQueries((prev) =>
          prev.map((q) =>
            q.id === activeQueryId
              ? { ...q, loading: false, result: result.data ?? [], error: null }
              : q
          )
        )
      }
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.detail : "Erro ao executar consulta SQL."
      setQueries((prev) =>
        prev.map((q) =>
          q.id === activeQueryId ? { ...q, loading: false, error: msg } : q
        )
      )
    }
  }, [activeQueryId, activeQuery.sql, sourceId])

  const handleAddQuery = useCallback(() => {
    const newQuery = createEmptyQuery()
    setQueries((prev) => [...prev, newQuery])
    setActiveQueryId(newQuery.id)
  }, [])

  const handleCloseQuery = useCallback(
    (id: string) => {
      setQueries((prev) => {
        if (prev.length <= 1) return prev
        const next = prev.filter((q) => q.id !== id)
        if (activeQueryId === id) {
          setActiveQueryId(next[0].id)
        }
        return next
      })
    },
    [activeQueryId]
  )

  const handleSqlChange = useCallback(
    (sql: string) => {
      setQueries((prev) =>
        prev.map((q) => (q.id === activeQueryId ? { ...q, sql } : q))
      )
    },
    [activeQueryId]
  )

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 size={20} className="animate-spin text-slate-400" />
      </div>
    )
  }

  if (error || !source) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
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
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Link
            href={`/fontes/${sourceId}`}
            className="flex items-center gap-1 text-sm text-slate-500 hover:text-teal-600 transition-colors"
          >
            <ArrowLeft size={14} />
          </Link>
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-teal-50 text-teal-700">
            <Icon size={14} />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-900">
              {source.database_name}
            </h1>
            <p className="text-[10px] text-slate-400">
              {typeConfig.label} &middot; Preparar
            </p>
          </div>
        </div>

        {!isFileSource && (
          <Button
            size="sm"
            onClick={() => setPublishOpen(true)}
            className="bg-teal-600 text-white hover:bg-teal-700"
          >
            <Send size={14} />
            Publicar como Dataset
          </Button>
        )}
      </header>

      {isFileSource ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <FileStack size={32} className="mx-auto text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">
              Preparação de arquivos {typeConfig.label} disponível em breve.
            </p>
            <Link
              href={`/fontes/${sourceId}`}
              className="mt-4 inline-block text-sm text-teal-600 hover:underline"
            >
              Voltar à fonte
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Object browser */}
          <div className="w-[280px] shrink-0">
            <ObjectBrowser
              sourceId={sourceId}
              sourceName={source.database_name}
              engine={typeConfig.label}
              schemas={schemas}
              schemaTables={schemaTables}
              expandedSchemas={expandedSchemas}
              loadingSchemas={loadingSchemas}
              schemasLoading={schemasLoading}
              schemasError={schemasError}
              onToggleSchema={toggleSchema}
              onSelectTable={handleSelectTable}
              onInsertInEditor={handleInsertInEditor}
              selectedTable={selectedTable}
            />
          </div>

          {/* Right: Editor + Results */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Query tabs */}
            <QueryTabs
              queries={queries.map((q) => ({ id: q.id, label: q.label }))}
              activeId={activeQueryId}
              onSelect={setActiveQueryId}
              onAdd={handleAddQuery}
              onClose={handleCloseQuery}
            />

            {/* Editor area */}
            <div className="border-b border-slate-200 bg-white px-4 pt-3">
              <QueryEditor
                value={activeQuery.sql}
                onChange={handleSqlChange}
                onExecute={handleExecute}
                loading={activeQuery.loading}
                tables={allTables}
                columns={allColumns}
              />
            </div>

            {/* Results area */}
            <div className="flex-1 overflow-y-auto bg-white">
              <ResultPanel
                data={activeQuery.result}
                loading={activeQuery.loading}
                error={activeQuery.error}
              />
            </div>
          </div>
        </div>
      )}

      {/* Publish dialog */}
      <PublishDialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        sourceId={sourceId}
        tableName={selectedTable?.table ?? ""}
        schemaName={selectedTable?.schema ?? "public"}
        databaseName={source.database_name}
      />
    </div>
  )
}
