"use client"

import dynamic from "next/dynamic"
import { useCallback, useEffect, useRef } from "react"
import { Loader2, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { OnMount } from "@monaco-editor/react"
import type { MonacoModel, MonacoPosition, CompletionRange, Monaco } from "./types"

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[300px] sm:h-[400px] lg:h-[500px] w-full items-center justify-center rounded-lg border border-border bg-card">
      <Loader2 size={20} className="animate-spin text-muted-foreground" />
    </div>
  ),
})

const SQL_KEYWORDS = [
  "SELECT", "FROM", "WHERE", "GROUP BY", "ORDER BY", "HAVING", "LIMIT",
  "JOIN", "LEFT JOIN", "INNER JOIN", "RIGHT JOIN", "ON",
  "AS", "AND", "OR", "NOT", "IN", "LIKE", "BETWEEN",
  "SUM", "AVG", "COUNT", "MIN", "MAX", "DISTINCT",
  "CASE", "WHEN", "THEN", "ELSE", "END",
  "NULL", "IS", "ASC", "DESC", "TRUE", "FALSE",
  "WITH",
  "INSERT", "UPDATE", "DELETE", "CREATE", "DROP", "TABLE",
  "INTO", "VALUES", "SET", "EXISTS", "TOP",
]

const FROM_KEYWORDS = ["FROM", "JOIN", "LEFT JOIN", "INNER JOIN", "RIGHT JOIN", "INTO"]

interface TableSuggestion {
  name: string
  detail?: string
}

interface SqlEditorProps {
  value: string
  onChange: (value: string) => void
  onExecute: () => void
  loading: boolean
  disabled?: boolean
  tables?: TableSuggestion[]
  columns?: string[]
  placeholder?: string
  height?: string
}

function buildKeywordSuggestions(monaco: Monaco, range: CompletionRange) {
  return SQL_KEYWORDS.map((kw) => ({
    label: kw,
    kind: monaco.languages.CompletionItemKind.Keyword,
    insertText: kw,
    detail: "Palavra-chave SQL",
    range,
  }))
}

function buildTableSuggestions(
  tables: TableSuggestion[],
  monaco: Monaco,
  range: CompletionRange,
) {
  return tables.map((t) => ({
    label: t.name,
    kind: monaco.languages.CompletionItemKind.Module,
    insertText: t.name,
    detail: t.detail ?? "Tabela",
    range,
  }))
}

function buildColumnSuggestions(
  columns: string[],
  monaco: Monaco,
  range: CompletionRange,
) {
  return columns.map((col) => ({
    label: col,
    kind: monaco.languages.CompletionItemKind.Field,
    insertText: col,
    detail: "Coluna",
    range,
  }))
}

export function SqlEditor({
  value,
  onChange,
  onExecute,
  loading,
  disabled = false,
  tables = [],
  columns = [],
  placeholder,
  height,
}: SqlEditorProps) {
  const tablesRef = useRef(tables)
  const columnsRef = useRef(columns)
  const onExecuteRef = useRef(onExecute)
  const loadingRef = useRef(loading)
  const disabledRef = useRef(disabled)

  useEffect(() => {
    tablesRef.current = tables
    columnsRef.current = columns
    onExecuteRef.current = onExecute
    loadingRef.current = loading
    disabledRef.current = disabled
  })

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editor.addAction({
      id: "execute-query",
      label: "Executar consulta",
      keybindings: [2048 | 49],
      run: () => {
        if (!loadingRef.current && !disabledRef.current) {
          onExecuteRef.current()
        }
      },
    })

    monaco.languages.registerCompletionItemProvider("sql", {
      triggerCharacters: [" ", ".", "("],
      provideCompletionItems: (model: MonacoModel, position: MonacoPosition) => {
        const textUntilPosition = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        })

        const words = textUntilPosition.trim().split(/\s+/)
        const lastWord = words[words.length - 1]?.toUpperCase() ?? ""
        const secondLastWord = words[words.length - 2]?.toUpperCase() ?? ""

        const isAfterFromKeyword =
          FROM_KEYWORDS.includes(lastWord) ||
          (lastWord === "" && FROM_KEYWORDS.includes(secondLastWord))

        const word = model.getWordUntilPosition(position)
        const range: CompletionRange = {
          startLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endLineNumber: position.lineNumber,
          endColumn: word.endColumn,
        }

        let suggestions

        if (isAfterFromKeyword) {
          suggestions = buildTableSuggestions(tablesRef.current, monaco, range)
        } else {
          const keywords = buildKeywordSuggestions(monaco, range)
          const cols = buildColumnSuggestions(columnsRef.current, monaco, range)
          suggestions = [...keywords, ...cols]
        }

        return { suggestions }
      },
    })
  }, [])

  function handleChange(val: string | undefined) {
    if (val !== undefined) {
      onChange(val)
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-lg border border-border">
        {placeholder && !value && (
          <div className="pointer-events-none absolute top-3 left-3 z-10 font-mono text-sm text-muted-foreground">
            {placeholder}
          </div>
        )}
        <MonacoEditor
          height={height ?? "300px"}
          className="w-full"
          language="sql"
          theme="vs"
          value={value}
          onChange={handleChange}
          onMount={handleMount}
          options={{
            minimap: { enabled: false },
            lineNumbers: "on",
            automaticLayout: true,
            fontSize: 14,
            scrollBeyondLastLine: false,
            wordWrap: "on",
            tabSize: 2,
            padding: { top: 12, bottom: 12 },
            readOnly: disabled,
            renderLineHighlight: "line",
            bracketPairColorization: { enabled: true },
            scrollbar: {
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
            },
          }}
        />
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          Ctrl+Enter para executar
        </span>

        <Button
          onClick={onExecute}
          disabled={loading || disabled}
          className="w-full sm:w-auto"
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Executando...
            </>
          ) : (
            <>
              <Play size={16} />
              Executar consulta
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
