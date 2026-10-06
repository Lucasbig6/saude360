"use client"

import { useState } from "react"
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

export default function NovaFontePage() {
  const router = useRouter()
  const [selectedType, setSelectedType] = useState<SourceType | null>(null)

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <section>
        <Link
          href="/fontes"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-600 transition-colors"
        >
          <Database size={14} />
          Fontes de Dados
        </Link>

        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
          Adicionar fonte
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {selectedType
            ? `Configure sua fonte de dados ${SOURCE_TYPES.find((t) => t.id === selectedType)?.label ?? ""}.`
            : "Escolha o tipo de fonte de dados que deseja adicionar."}
        </p>
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
                    "group flex flex-col items-center rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md cursor-pointer"
                  )}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50 text-slate-600 transition-colors group-hover:bg-teal-50 group-hover:text-teal-700">
                    <Icon size={24} />
                  </div>
                  <h3 className="mt-3 text-sm font-semibold text-slate-900">
                    {type.label}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {type.description}
                  </p>
                  {!type.needsConnection && (
                    <span className="mt-2 inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      Em breve
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* Form */}
      {selectedType === "postgresql" && (
        <PostgresForm onBack={() => setSelectedType(null)} />
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

function PostgresForm({ onBack }: { onBack: () => void }) {
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
      })
      router.push("/fontes")
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
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
              <Database size={20} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                PostgreSQL
              </h2>
              <p className="text-xs text-slate-500">
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
            <p className="text-xs text-slate-400">
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
                ? "border border-green-200 bg-green-50 text-green-700"
                : "border border-red-200 bg-red-50 text-red-600"
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
          <div className="mt-2 rounded-lg border border-red-100 bg-red-50/50 px-4 py-3 text-xs text-red-500 font-mono whitespace-pre-wrap">
            {testResult.detail}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              <AlertCircle size={16} />
              {error}
            </div>
          </div>
        )}

        {/* Warning: test not passed */}
        {testResult && !testResult.success && (
          <p className="mt-3 text-xs text-amber-600">
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
            className="bg-teal-600 text-white hover:bg-teal-700"
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
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-slate-600">
              <Icon size={20} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                {config?.label ?? type}
              </h2>
              <p className="text-xs text-slate-500">
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
          <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <Upload size={20} className="text-slate-400" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-slate-900">
              Upload de arquivo
            </h3>
            <p className="mt-1 max-w-sm text-xs text-slate-500">
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
            <p className="mt-2 text-xs text-amber-600 font-medium">
              Funcionalidade em breve
            </p>
          </div>
        </div>

        {/* Actions — disabled for file sources */}
        <div className="mt-6 flex items-center gap-3">
          <Button disabled className="opacity-50 cursor-not-allowed">
            Salvar
          </Button>
          <p className="text-xs text-slate-500">
            O upload de arquivos será disponibilizado em uma próxima versão.
          </p>
        </div>
      </div>
    </section>
  )
}
