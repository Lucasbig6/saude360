"use client"

import { use, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AlertCircle,
  CheckCircle2,
  Database,
  FileStack,
  FileText,
  Loader2,
  Table,
  Upload,
} from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import {
  createSource,
  testConnection,
  type SourceType,
  SOURCE_TYPES,
} from "@/lib/api/sources"
import { ApiError } from "@/lib/api"

const ICONS: Record<string, typeof Database> = {
  Database,
  FileText,
  Table,
  FileStack,
}

export default function NovaFontePage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = use(params)
  return <NovaFonteContent projectId={projectId} />
}

function NovaFonteContent({ projectId }: { projectId: string }) {
  const [selectedType, setSelectedType] = useState<SourceType | null>(null)

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <section>
        <Link
          href={`/projetos/${projectId}/fontes`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          <Database size={14} />
          Fontes de Dados
        </Link>

        <PageHeader
          className="mt-3"
          title="Adicionar fonte"
          description={
            selectedType
              ? `Configure sua fonte de dados ${SOURCE_TYPES.find((t) => t.id === selectedType)?.label ?? ""}.`
              : "Escolha o tipo de fonte de dados que deseja adicionar."
          }
        />
      </section>

      {/* Type selector */}
      {!selectedType && (
        <section className="mt-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SOURCE_TYPES.map((type) => {
              const Icon = ICONS[type.icon] ?? Database
              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setSelectedType(type.id)}
                  className={cn(
                    "group flex flex-col items-center rounded-lg border border-border bg-card p-6 text-center transition-colors hover:border-primary/40 cursor-pointer"
                  )}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                    <Icon size={24} />
                  </div>
                  <h3 className="mt-3 text-sm font-semibold text-foreground">
                    {type.label}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {type.description}
                  </p>
                  {!type.needsConnection && (
                    <Badge variant="warning" className="mt-2">
                      Em breve
                    </Badge>
                  )}
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* Form */}
      {selectedType === "postgresql" && (
        <PostgresForm
          projectId={projectId}
          onBack={() => setSelectedType(null)}
        />
      )}

      {selectedType && selectedType !== "postgresql" && (
        <FileSourceForm
          type={selectedType}
          onBack={() => setSelectedType(null)}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  PostgreSQL Form                                                    */
/* ------------------------------------------------------------------ */

function PostgresForm({
  projectId,
  onBack,
}: {
  projectId: string
  onBack: () => void
}) {
  const router = useRouter()

  const [databaseName, setDatabaseName] = useState("")
  const [host, setHost] = useState("db")
  const [port, setPort] = useState("5432")
  const [database, setDatabase] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    message: string
    detail?: string
  } | null>(null)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canTest =
    host.trim() && port && database.trim() && username.trim() && password.trim()
  const canSave = canTest && databaseName.trim()

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    setError(null)

    try {
      const result = await testConnection({
        host: host.trim(),
        port: parseInt(port, 10) || 5432,
        database: database.trim(),
        username: username.trim(),
        password,
      })
      setTestResult(result)
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.detail
          : "Não foi possível testar a conexão."
      setTestResult({ success: false, message: msg })
    } finally {
      setTesting(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setError(null)

    try {
      await createSource({
        database_name: databaseName.trim(),
        engine: "postgresql",
        host: host.trim(),
        port: parseInt(port, 10) || 5432,
        database: database.trim(),
        username: username.trim(),
        password,
        projectId,
      })
      router.push(`/projetos/${projectId}/fontes`)
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.detail
          : "Erro ao salvar a fonte de dados."
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-6">
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Database size={20} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                PostgreSQL
              </h2>
              <p className="text-xs text-muted-foreground">
                Conexão com banco de dados PostgreSQL.
              </p>
            </div>
          </div>

          <Button variant="ghost" size="sm" onClick={onBack}>
            Trocar tipo
          </Button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-2">
            <Label htmlFor="database-name">Nome da fonte *</Label>
            <Input
              id="database-name"
              placeholder="Ex: SESAPI Produção"
              value={databaseName}
              onChange={(e) => setDatabaseName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="host">Host *</Label>
            <Input
              id="host"
              placeholder="Ex: monisus-postgres-demo"
              value={host}
              onChange={(e) => setHost(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Use o nome do container Docker. Se o Superset e o banco estão em containers, <code>localhost</code> não funciona.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="port">Porta *</Label>
            <Input
              id="port"
              type="number"
              placeholder="5432"
              value={port}
              onChange={(e) => setPort(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="database">Banco de dados *</Label>
            <Input
              id="database"
              placeholder="Ex: sesapi_prod"
              value={database}
              onChange={(e) => setDatabase(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="username">Usuário *</Label>
            <Input
              id="username"
              placeholder="Ex: admin"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="sm:col-span-2 space-y-2">
            <Label htmlFor="password">Senha *</Label>
            <Input
              id="password"
              type="password"
              placeholder="Senha do banco de dados"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>

        {/* Test result */}
        {testResult && (
          <div
            className={`mt-4 flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${
              testResult.success
                ? "border border-success/30 bg-success/10 text-success"
                : "border border-destructive/30 bg-destructive/10 text-destructive"
            }`}
          >
            {testResult.success ? (
              <CheckCircle2 size={16} />
            ) : (
              <AlertCircle size={16} />
            )}
            {testResult.message}
          </div>
        )}

        {/* Error detail from Superset */}
        {testResult && !testResult.success && testResult.detail && (
          <div className="mt-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs text-destructive font-mono whitespace-pre-wrap">
            {testResult.detail}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle size={16} />
              {error}
            </div>
          </div>
        )}

        {/* Warning: test not passed */}
        {testResult && !testResult.success && (
          <p className="mt-3 text-xs text-warning">
            A conexão ainda não foi testada com sucesso. Recomendamos testar antes de salvar.
          </p>
        )}

        {/* Actions */}
        <div className="mt-6 flex items-center gap-3">
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={!canTest || testing}
          >
            {testing ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <CheckCircle2 size={14} />
            )}
            Testar conexão
          </Button>

          <Button
            onClick={handleSave}
            disabled={!canSave || saving}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            Salvar
          </Button>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/*  File Source Form (CSV / Excel / Parquet) — placeholder             */
/* ------------------------------------------------------------------ */

function FileSourceForm({
  type,
  onBack,
}: {
  type: SourceType
  onBack: () => void
}) {
  const config = SOURCE_TYPES.find((t) => t.id === type)
  const Icon = ICONS[config?.icon ?? "Database"] ?? Database

  return (
    <section className="mt-6">
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
              <Icon size={20} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {config?.label ?? type}
              </h2>
              <p className="text-xs text-muted-foreground">
                {config?.description ?? ""}
              </p>
            </div>
          </div>

          <Button variant="ghost" size="sm" onClick={onBack}>
            Trocar tipo
          </Button>
        </div>

        <div className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file-source-name">Nome da fonte *</Label>
            <Input
              id="file-source-name"
              placeholder={`Ex: Meus dados ${config?.label ?? ""}`}
              disabled
            />
          </div>

          {/* Upload area */}
          <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/50/50 p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Upload size={20} className="text-muted-foreground" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-foreground">
              Upload de arquivo
            </h3>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              Arraste e solte ou selecione um arquivo{" "}
              {config?.label ?? type} para importar.
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled
              className="mt-4 opacity-50 cursor-not-allowed"
            >
              Selecionar arquivo
            </Button>
            <p className="mt-2 text-xs text-warning font-medium">
              Funcionalidade em breve
            </p>
          </div>
        </div>

        {/* Actions — disabled for file sources */}
        <div className="mt-6 flex items-center gap-3">
          <Button disabled className="opacity-50 cursor-not-allowed">
            Salvar
          </Button>
          <p className="text-xs text-muted-foreground">
            O upload de arquivos será disponibilizado em uma próxima versão.
          </p>
        </div>
      </div>
    </section>
  )
}
