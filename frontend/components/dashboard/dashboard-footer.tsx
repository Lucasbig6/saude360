"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import {
  Maximize2,
  Minimize2,
  Pencil,
  RefreshCw,
  Share2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { DashboardPage } from "@/lib/types/dashboard"
import { DashboardPageTabs } from "./dashboard-page-tabs"

interface DashboardFooterProps {
  pages: DashboardPage[]
  activePageId: string
  onSelectPage: (pageId: string) => void
  /** Exibe o logo oficial do SIGDATA (aparência "Exibir marca SIGDATA"). */
  showBrand?: boolean
  canEdit?: boolean
  editHref?: string
  onUpdate?: () => void
  onShare?: () => void
  /** Espaço extra à direita da linha interna (ex.: painel do copiloto). */
  className?: string
}

/**
 * Barra inferior dos dashboards compartilhados (padrão Power BI):
 * logo SIGDATA à esquerda, abas de página e ações de visualização
 * (atualizar, tela cheia, compartilhar, editar). Filtros vivem como
 * widgets no canvas, nunca aqui.
 *
 * Vive no fluxo do layout (não é `fixed`): o conteúdo rola em uma área
 * própria acima dela, então a footer nunca cobre gráficos nem tabelas.
 */
export function DashboardFooter({
  pages,
  activePageId,
  onSelectPage,
  showBrand = true,
  canEdit = false,
  editHref,
  onUpdate,
  onShare,
  className,
}: DashboardFooterProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Fullscreen API: sincroniza com o estado real do navegador (o usuário
  // também pode sair com Esc). Guard evita falha em ambientes sem suporte.
  useEffect(() => {
    function sync() {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    sync()
    document.addEventListener("fullscreenchange", sync)
    return () => document.removeEventListener("fullscreenchange", sync)
  }, [])

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen?.()
      } else if (typeof document.documentElement.requestFullscreen === "function") {
        await document.documentElement.requestFullscreen()
      }
    } catch {
      // Permissão negada ou indisponível: mantém a UI sem erro.
    }
  }

  return (
    <footer
      data-testid="dashboard-footer"
      className="relative z-[45] shrink-0 border-t border-border bg-card"
    >
      <div
        className={cn(
          "flex h-20 items-center gap-2 px-3 transition-[padding-right] duration-200 sm:px-4",
          className
        )}
      >
        {showBrand && (
          <>
            <Image
              src="/Logo principal.svg"
              alt="SIGDATA"
              width={283}
              height={90}
              className="h-auto w-[85px] shrink-0 sm:w-[150px]"
            />
            {/* Divider vertical entre a marca e as abas de página. */}
            <div
              aria-hidden
              data-testid="footer-brand-divider"
              className="h-8 w-px shrink-0 bg-border"
            />
          </>
        )}

        <DashboardPageTabs
          pages={pages}
          activePageId={activePageId}
          onSelect={onSelectPage}
          className="max-w-[45%]"
        />

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          {onUpdate && (
            <Button
              variant="outline"
              size="sm"
              onClick={onUpdate}
              title="Atualizar dados"
              aria-label="Atualizar dados"
            >
              <RefreshCw size={14} />
              <span className="hidden sm:inline">Atualizar</span>
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={toggleFullscreen}
            aria-pressed={isFullscreen}
            title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
            aria-label={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            <span className="hidden sm:inline">
              {isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
            </span>
          </Button>

          {onShare && (
            <Button
              variant="outline"
              size="sm"
              onClick={onShare}
              title="Compartilhar"
              aria-label="Compartilhar painel"
            >
              <Share2 size={14} />
              <span className="hidden sm:inline">Compartilhar</span>
            </Button>
          )}

          {canEdit && (
            <Link href={editHref ?? "/paineis"}>
              <Button
                variant="ghost"
                size="sm"
                title="Editar dashboard"
                aria-label="Editar dashboard"
              >
                <Pencil size={13} />
                <span className="hidden sm:inline">Editar</span>
              </Button>
            </Link>
          )}
        </div>
      </div>
    </footer>
  )
}
