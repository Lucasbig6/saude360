"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronDown, LogOut, Settings, User } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { clearTokens, getCurrentUsername } from "@/lib/auth"
import { BrandMark } from "./sidebar"

function initialsOf(name: string): string {
  return name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("")
}

export function Header() {
  const router = useRouter()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  // lido do JWT no cliente; no servidor renderiza o fallback.
  const [username] = useState(() => getCurrentUsername())

  const label = username ?? "Usuário"

  function handleLogout() {
    clearTokens()
    router.push("/login")
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <Link href="/inicio" className="flex items-center gap-2.5">
          <BrandMark />
        </Link>

        <span className="flex h-4 w-px bg-border flex-shrink-0"></span>

        <nav className="md:items-center md:flex gap-8">
          <Link
            href="/projetos"
            className="text-sm font-medium text-foreground hover:text-primary transition-colors"
          >
            Projetos
          </Link>
          <Link
            href="/fontes"
            className="text-sm font-medium text-foreground hover:text-primary transition-colors"
          >
            Fontes
          </Link>
          <Link
            href="/explorar"
            className="text-sm font-medium text-foreground hover:text-primary transition-colors"
          >
            Explorar
          </Link>
          <Link
            href="/analises"
            className="text-sm font-medium text-foreground hover:text-primary transition-colors"
          >
            Análises
          </Link>
          <Link
            href="/paineis"
            className="text-sm font-medium text-foreground hover:text-primary transition-colors"
          >
            Painéis
          </Link>
        </nav>
      </div>

      <DropdownMenu open={userMenuOpen} onOpenChange={setUserMenuOpen}>
        <DropdownMenuTrigger className="flex shrink-0 cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50">
          <div
            suppressHydrationWarning
            className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
          >
            {initialsOf(label)}
          </div>
          <span
            suppressHydrationWarning
            className="hidden text-sm font-medium text-foreground md:block"
          >
            {label}
          </span>
          <ChevronDown
            size={14}
            className={cn(
              "hidden text-muted-foreground transition-transform duration-200 md:block",
              userMenuOpen && "rotate-180"
            )}
          />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" sideOffset={8} className="w-48">
          <DropdownMenuItem className="cursor-pointer gap-2.5">
            <User size={16} className="text-muted-foreground" />
            <span>Meu Perfil</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer gap-2.5">
            <Settings size={16} className="text-muted-foreground" />
            <span>Configurações</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            className="cursor-pointer gap-2.5 text-destructive focus:text-destructive"
            onClick={handleLogout}
          >
            <LogOut size={16} />
            <span>Sair</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
