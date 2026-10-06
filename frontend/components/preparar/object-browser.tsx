"use client"

import { useCallback, useEffect, useState } from "react"
import {
  ChevronRight,
  Database,
  FolderOpen,
  Loader2,
  Search,
  Table2,
  X,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  getTableMetadata,
  type TableItem,
  type TableColumn,
} from "@/lib/api/sources"
import { ApiError } from "@/lib/api"

interface ObjectBrowserProps {
  sourceId: number
  sourceName: string
  engine: string
  schemas: string[]
  schemaTables: Record<string, TableItem[]>
  expandedSchemas: Set<string>
  loadingSchemas: Set<string>
  schemasLoading: boolean
  schemasError: string | null
  onToggleSchema: (schema: string) => void
  onSelectTable: (schema: string, table: string) => void
  onInsertInEditor: (schema: string, table: string) => void
  selectedTable: { schema: string; table: string } | null
}

export function ObjectBrowser({
  sourceId,
  sourceName,
  engine,
  schemas,
  schemaTables,
  expandedSchemas,
  loadingSchemas,
  schemasLoading,
  schemasError,
  onToggleSchema,
  onSelectTable,
  onInsertInEditor,
  selectedTable,
}: ObjectBrowserProps) {
  const [search, setSearch] = useState("")

  const [metaTable, setMetaTable] = useState<{
    schema: string
    table: string
    columns: TableColumn[]
  } | null>(null)
  const [metaLoading, setMetaLoading] = useState(false)

  const loadMetadata = useCallback(
    async (schema: string, table: string) => {
      setMetaLoading(true)
      setMetaTable(null)
      try {
        const data = await getTableMetadata(sourceId, schema, table)
        setMetaTable({ schema, table, columns: data.columns ?? [] })
      } catch {
        setMetaTable({ schema, table, columns: [] })
      } finally {
        setMetaLoading(false)
      }
    },
    [sourceId]
  )

  useEffect(() => {
    if (!selectedTable) return
    // Carregamento assíncrono: as atualizações de estado acontecem depois
    // do await, nunca de forma síncrona dentro do effect.
    queueMicrotask(() => {
      void loadMetadata(selectedTable.schema, selectedTable.table)
    })
  }, [selectedTable, loadMetadata])

  const filteredSchemas = schemas.filter((schema) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    if (schema.toLowerCase().includes(q)) return true
    const tables = schemaTables[schema]
    if (tables) return tables.some((t) => t.name.toLowerCase().includes(q))
    return false
  })

  return (
    <div className="flex h-full flex-col border-r border-border bg-card">
      {/* Header */}
      <div className="border-b border-border px-3 py-3">
        <div className="flex items-center gap-2">
          <Database size={14} className="shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-foreground">
              {sourceName}
            </p>
            <p className="text-xs text-muted-foreground uppercase">{engine}</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="border-b border-border px-3 py-2">
        <div className="relative">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Buscar objeto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 pr-7 text-xs"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Schema tree */}
      <div className="flex-1 overflow-y-auto">
        {schemasLoading ? (
          <div className="flex items-center justify-center p-6">
            <Loader2 size={16} className="animate-spin text-muted-foreground" />
          </div>
        ) : schemasError ? (
          <div className="p-3 text-xs text-destructive">{schemasError}</div>
        ) : filteredSchemas.length === 0 ? (
          <div className="p-3 text-center text-xs text-muted-foreground">
            {schemas.length === 0
              ? "Nenhum schema encontrado."
              : "Nenhum objeto corresponde à busca."}
          </div>
        ) : (
          filteredSchemas.map((schema) => {
            const isExpanded = expandedSchemas.has(schema)
            const isLoading = loadingSchemas.has(schema)
            const tables = schemaTables[schema]
            const q = search.toLowerCase()
            const filteredTables = tables
              ? q
                ? tables.filter((t) => t.name.toLowerCase().includes(q))
                : tables
              : undefined

            return (
              <div key={schema}>
                <button
                  type="button"
                  onClick={() => onToggleSchema(schema)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  <FolderOpen size={13} className="shrink-0 text-primary" />
                  <span className="font-medium text-foreground">{schema}</span>
                  {tables && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {tables.length}
                    </span>
                  )}
                  <ChevronRight
                    size={12}
                    className={`shrink-0 text-muted-foreground transition-transform ${
                      isExpanded ? "rotate-90" : ""
                    }`}
                  />
                </button>

                {isExpanded && (
                  <div>
                    {isLoading ? (
                      <div className="flex items-center justify-center py-3">
                        <Loader2
                          size={12}
                          className="animate-spin text-muted-foreground"
                        />
                      </div>
                    ) : filteredTables && filteredTables.length === 0 ? (
                      <div className="px-6 py-2 text-xs text-muted-foreground">
                        Nenhuma tabela
                      </div>
                    ) : (
                      filteredTables?.map((table) => {
                        const isSelected =
                          selectedTable?.schema === schema &&
                          selectedTable?.table === table.name

                        return (
                          <div
                            key={table.name}
                            className={`group flex items-center gap-2 pl-8 pr-3 py-1.5 text-sm cursor-pointer transition-colors ${
                              isSelected
                                ? "bg-primary/10 text-primary"
                                : "text-muted-foreground hover:bg-muted/50"
                            }`}
                            onClick={() => onSelectTable(schema, table.name)}
                            onDoubleClick={() =>
                              onInsertInEditor(schema, table.name)
                            }
                          >
                            <Table2
                              size={12}
                              className={`shrink-0 ${
                                isSelected ? "text-primary" : "text-muted-foreground"
                              }`}
                            />
                            <span className="min-w-0 flex-1 truncate">
                              {table.name}
                            </span>
                            <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                             双击 inserir
                            </span>
                          </div>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Metadata panel */}
      {(metaLoading || metaTable) && (
        <div className="border-t border-border bg-muted/50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Estrutura
            </span>
            {metaTable && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() =>
                  onInsertInEditor(metaTable.schema, metaTable.table)
                }
              >
                Inserir no editor
              </Button>
            )}
          </div>

          {metaLoading ? (
            <div className="flex items-center justify-center p-4">
              <Loader2 size={14} className="animate-spin text-muted-foreground" />
            </div>
          ) : metaTable ? (
            <div className="max-h-[200px] overflow-y-auto">
              {metaTable.columns.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground text-center">
                  Nenhuma informação disponível.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">
                        Coluna
                      </th>
                      <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">
                        Tipo
                      </th>
                      <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">
                        Chave
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {metaTable.columns.map((col) => (
                      <tr
                        key={col.name}
                        className="border-b border-border last:border-0"
                      >
                        <td className="px-3 py-1 font-medium text-foreground">
                          {col.name}
                        </td>
                        <td className="px-3 py-1 text-muted-foreground">
                          {col.type}
                        </td>
                        <td className="px-3 py-1">
                          {col.keys.length > 0 ? (
                            <span className="inline-flex rounded bg-primary/10 px-1 py-0.5 text-[9px] font-medium text-primary">
                              {col.keys.join(", ")}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
