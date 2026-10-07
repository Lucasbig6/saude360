"use client"

import { PublishDatasetDialog } from "@/components/datasets/publish-dataset-dialog"
import { createDataset } from "@/lib/api/datasets"

interface PublishDialogProps {
  open: boolean
  onClose: () => void
  sourceId: number
  tableName: string
  schemaName: string
  databaseName: string
}

export function PublishDialog({
  open,
  onClose,
  sourceId,
  tableName,
  schemaName,
  databaseName,
}: PublishDialogProps) {
  return (
    <PublishDatasetDialog
      open={open}
      onOpenChange={(o) => { if (!o) onClose() }}
      title="Publicar como Dataset"
      description={`Registre a tabela ${schemaName}.${tableName} como dataset no SIGDATA. A tabela original no banco externo não será alterada.`}
      defaultName={tableName}
      successMessage="Dataset publicado com sucesso!"
      successDetail="O dataset está disponível na lista de datasets da fonte e no Explorar."
      footerInfo={`Fonte: ${databaseName} · Tabela: ${schemaName}.${tableName}`}
      onPublish={async (name, description) => {
        await createDataset({
          database_id: sourceId,
          table_name: tableName,
          table_schema: schemaName,
          description: description || undefined,
        })
      }}
      onSuccess={onClose}
    />
  )
}
