"use client"

import { PublishDatasetDialog } from "@/components/datasets/publish-dataset-dialog"
import { publishDataset } from "@/lib/api/datasets"

interface PublishDialogProps {
  open: boolean
  onClose: () => void
  sourceId: number
  sql: string
  defaultName: string
  schemaName: string
  databaseName: string
}

export function PublishDialog({
  open,
  onClose,
  sourceId,
  sql,
  defaultName,
  schemaName,
  databaseName,
}: PublishDialogProps) {
  return (
    <PublishDatasetDialog
      key={`${sourceId}:${schemaName}:${defaultName}`}
      open={open}
      onOpenChange={(o) => { if (!o) onClose() }}
      title="Publicar como Dataset"
      description="O resultado da consulta será materializado como uma nova tabela e publicado como dataset. A fonte original não será alterada."
      defaultName={defaultName}
      successMessage="Dataset publicado com sucesso!"
      successDetail="O resultado preparado está disponível como dataset no Explorador."
      footerInfo={`Fonte: ${databaseName} · Schema de destino: ${schemaName}`}
      onPublish={async (name, description) => {
        await publishDataset({
          database_id: sourceId,
          sql,
          db_schema: schemaName,
          name,
          description: description || null,
        })
      }}
      onSuccess={onClose}
    />
  )
}
