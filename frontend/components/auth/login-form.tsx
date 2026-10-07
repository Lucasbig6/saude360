"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { login, saveTokens, ApiError } from "@/lib/auth"

export function LoginForm() {
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!username.trim() || !password.trim()) {
      setError("Preencha todos os campos.")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const data = await login(username.trim(), password)
      saveTokens(data)
      router.push("/inicio")
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setError("Credenciais inválidas. Verifique usuário e senha.")
        } else if (err.status === 503) {
          setError("Serviço de autenticação indisponível. Tente novamente.")
        } else {
          setError(err.detail || "Erro ao efetuar login. Tente novamente.")
        }
      } else {
        setError("Erro de conexão. Verifique sua internet.")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="username">Usuário</Label>
        <Input
          id="username"
          type="text"
          placeholder="Digite seu usuário"
          value={username}
          className="h-11"
          onChange={(e) => {
            setUsername(e.target.value)
            if (error) setError(null)
          }}
          disabled={loading}
          autoComplete="username"
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Senha</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            placeholder="Digite sua senha"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              if (error) setError(null)
            }}
            disabled={loading}
            autoComplete="current-password"
            className="h-11 pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <Button
        type="submit"
        className="h-11 w-full"
        disabled={loading}
      >
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Entrando...
          </>
        ) : (
          "Entrar"
        )}
      </Button>
    </form>
  )
}
