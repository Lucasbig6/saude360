"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import {
  Activity,
  BarChart3,
  ChevronDown,
  Database,
  FileChartColumn,
  Home,
  Hospital,
  Menu,
  Search,
  Settings,
  LogOut,
  User,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { clearTokens } from "@/lib/auth"

const navigation = [
  { name: "Início", href: "/inicio" },
  { name: "Projetos", href: "/projetos" },
  { name: "Painéis", href: "/paineis" },
  { name: "Explorar", href: "/explorar" },
  { name: "Fontes", href: "/fontes" },
  { name: "Análises", href: "/analises" },
] as const

const mobileNavIcons: Record<string, typeof Home> = {
  "/inicio": Home,
  "/projetos": Hospital,
  "/paineis": BarChart3,
  "/explorar": Search,
  "/fontes": Database,
  "/analises": FileChartColumn,
}

const user = {
  name: "Lucas Admin",
  initials: "LA",
}

function isNavActive(pathname: string, href: string): boolean {
  if (href === "/inicio") {
    return pathname === "/inicio" || pathname === "/"
  }
  return pathname.startsWith(href)
}

export function Header() {
  const router = useRouter()
  const pathname = usePathname()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  function handleLogout() {
    clearTokens()
    router.push("/login")
  }

  return (
    <header className="sticky top-0 z-30 flex h-20 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 lg:px-6">
      {/* Logo | divider | nav */}
      <div className="flex min-w-0 items-center gap-3 lg:gap-4">
        <Link
          href="/inicio"
          className="flex shrink-0 items-center gap-2.5"
          onClick={() => setMobileNavOpen(false)}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 text-white shadow-sm">
            <Activity size={18} strokeWidth={2.5} />
          </div>
          <span className="text-base font-semibold text-slate-900 whitespace-nowrap">
            Saude360
          </span>
        </Link>

        {/* Divider logo → navlinks */}
        <span
          aria-hidden="true"
          className="hidden h-10 w-px shrink-0 bg-slate-200 md:block"
        />

        {/* Desktop nav */}
        <nav
          aria-label="Navegação principal"
          className="hidden items-center gap-0.5 md:flex"
        >
          {navigation.map((item) => {
            const active = isNavActive(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative rounded-md px-3 py-5 text-sm font-medium transition-colors",
                  active
                    ? "text-teal-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )}
              >
                {item.name}
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-2 -bottom-[9px] h-0.5 rounded-full bg-teal-600"
                  />
                )}
              </Link>
            )
          })}
        </nav>

        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={() => setMobileNavOpen((v) => !v)}
          className="ml-1 flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 md:hidden"
          aria-label={mobileNavOpen ? "Fechar menu" : "Abrir menu"}
          aria-expanded={mobileNavOpen}
        >
          {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* User menu */}
      <DropdownMenu open={userMenuOpen} onOpenChange={setUserMenuOpen}>
        <DropdownMenuTrigger className="flex shrink-0 items-center gap-2.5 rounded-lg px-2 py-1.5 outline-none transition-colors hover:bg-slate-100 cursor-pointer focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-teal-600 text-sm font-semibold text-white shadow-sm">
            {user.initials}
          </div>
          <span className="hidden text-sm font-medium text-slate-900 md:block">
            {user.name}
          </span>
          <ChevronDown
            size={14}
            className={cn(
              "hidden text-slate-400 transition-transform duration-200 md:block",
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

      {/* Mobile nav dropdown */}
      {mobileNavOpen && (
        <div
          className="absolute inset-x-0 top-full border-b border-slate-200 bg-white shadow-lg md:hidden"
          role="navigation"
          aria-label="Navegação mobile"
        >
          <nav className="flex flex-col gap-0.5 px-3 py-3">
            {navigation.map((item) => {
              const Icon = mobileNavIcons[item.href] ?? Home
              const active = isNavActive(pathname, item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileNavOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                    active
                      ? "bg-teal-50 text-teal-700"
                      : "text-slate-700 hover:bg-slate-100"
                  )}
                >
                  <Icon size={17} className="shrink-0" />
                  {item.name}
                </Link>
              )
            })}
          </nav>
        </div>
      )}
    </header>
  )
}
