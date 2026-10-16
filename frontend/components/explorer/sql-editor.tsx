"use client"

import { SqlEditor as SharedSqlEditor } from "@/components/sql/sql-editor"
import {
  datasetDisplayName,
  type DatasetListItem,
} from "@/lib/api/datasets"

interface SqlEditorProps {
  value: string
  onChange: (value: string) => void
  onExecute: () => void
  loading: boolean
  disabled?: boolean
  datasets?: DatasetListItem[]
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
      tables={datasets.map((dataset) => ({
        name: datasetDisplayName(dataset),
        insertText: dataset.table_name,
        detail: "Dataset",
      }))}
      columns={columns.map((c) => c.column_name)}
      placeholder="-- Exemplo: SELECT * FROM demo_atendimentos LIMIT 100;"
    />
  )
}
