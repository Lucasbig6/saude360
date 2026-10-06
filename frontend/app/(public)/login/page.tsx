import { Activity } from "lucide-react"
import { LoginForm } from "@/components/auth/login-form"

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Card de login */}
        <div className="rounded-lg border border-border bg-card p-6">
          {/* Logo e título */}
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Activity size={24} strokeWidth={2.5} />
            </div>

            <h1 className="text-2xl font-semibold text-foreground">Saude360</h1>

            <p className="mt-1 text-sm text-muted-foreground">
              Monitoramento e análise de dados do SUS
            </p>
          </div>

          <LoginForm />
        </div>
      </div>
    </div>
  )
}
