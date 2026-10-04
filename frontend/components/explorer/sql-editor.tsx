"use client"

import { SqlEditor as SharedSqlEditor } from "@/components/sql/sql-editor"

interface SqlEditorProps {
  value: string
  onChange: (value: string) => void
  onExecute: () => void
  loading: boolean
  disabled?: boolean
  datasets?: Array<{ table_name: string }>
  columns?: Array<{ column_name: string }>
  height?: string
}

export function SqlEditor({
  datasets = [],
  columns = [],
  ...rest
}: SqlEditorProps) {
  return (
    <SharedSqlEditor
      {...rest}
      tables={datasets.map((ds) => ({ name: ds.table_name, detail: "Dataset" }))}
      columns={columns.map((c) => c.column_name)}
      placeholder="-- Exemplo: SELECT * FROM demo_atendimentos LIMIT 100;"
    />
  )
}
