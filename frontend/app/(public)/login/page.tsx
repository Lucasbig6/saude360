import Image from "next/image"
import { LoginForm } from "@/components/auth/login-form"

export default function LoginPage() {
  return (
    <main className="grid min-h-screen bg-background md:grid-cols-[3fr_2fr]">
      <section className="relative hidden min-h-screen flex-col justify-center overflow-hidden border-r border-border bg-primary/[0.035] px-8 py-8 md:flex lg:px-12 lg:py-12 xl:px-16">
        <div className="flex w-full max-w-xl flex-col">
          <div className="flex items-center">
            <Image
              src="/Logo principal.svg"
              alt="SIGDATA"
              width={290}
              height={100}
              priority
              className="h-[120px] w-[270px]"
            />
          </div>

          <div className="mt-10 max-w-md lg:mt-12">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
              Inteligência em saúde pública
            </p>
            <h1 className="mt-3 max-w-md text-[22px] font-semibold leading-tight text-foreground lg:text-3xl">
              Inteligência para dados de
              <br />
              saúde.
            </h1>
            <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground lg:text-base lg:leading-7">
              Transforme dados do SUS em análises, indicadores e decisões mais rápidas.
            </p>
          </div>

          <div className="mt-5 w-full" aria-hidden="true">
            <Image
              src="/saude360-territory.svg"
              alt=""
              width={640}
              height={360}
              priority
              className="h-auto w-full"
            />
          </div>

          <p className="mt-8 text-[11px] text-muted-foreground/75">
            Plataforma de monitoramento e análise de dados do SUS
          </p>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-5 sm:px-2 md:px-2 lg:px-8">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 flex items-center justify-center md:hidden">
            <Image
              src="/Logo principal.svg"
              alt="SIGDATA"
              width={283}
              height={90}
              priority
              className="h-auto w-[160px]"
            />
          </div>

          <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
            <div className="mb-7">
              <h2 className="text-2xl font-semibold text-foreground">Bem-vindo ao SIGDATA</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Entre na sua conta para continuar.
              </p>
            </div>

            <LoginForm />

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Esqueceu sua senha?
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}
