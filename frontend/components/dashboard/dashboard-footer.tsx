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
  SlidersHorizontal,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { DashboardFilter, DashboardPage } from "@/lib/types/dashboard"
import { DashboardFiltersBar } from "./dashboard-filters-bar"
import { DashboardPageTabs } from "./dashboard-page-tabs"

interface DashboardFooterProps {
  pages: DashboardPage[]
  activePageId: string
  onSelectPage: (pageId: string) => void
  filters: DashboardFilter[]
  filterValues: Record<string, string | string[]>
  onFilterValueChange: (filterId: string, value: string | string[]) => void
  loadingDistinct?: boolean
  distinctValues?: Record<string, string[]>
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
 * logo SIGDATA à esquerda, abas de página, filtros globais e ações de
 * visualização (atualizar, tela cheia, compartilhar, editar).
 *
 * Vive no fluxo do layout (não é `fixed`): o conteúdo rola em uma área
 * própria acima dela, então a footer nunca cobre gráficos nem tabelas.
 */
export function DashboardFooter({
  pages,
  activePageId,
  onSelectPage,
  filters,
  filterValues,
  onFilterValueChange,
  loadingDistinct = false,
  distinctValues = {},
  showBrand = true,
  canEdit = false,
  editHref,
  onUpdate,
  onShare,
  className,
}: DashboardFooterProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)

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

  const filtersBar =
    filters.length > 0 ? (
      <DashboardFiltersBar
        filters={filters}
        editing={false}
        filterValues={filterValues}
        loadingDistinct={loadingDistinct}
        distinctValues={distinctValues}
        onValueChange={onFilterValueChange}
        wrap
      />
    ) : null

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
          <Image
            src="/Logo principal.svg"
            alt="SIGDATA"
            width={283}
            height={90}
            className="h-auto w-[85px] shrink-0 sm:w-[150px]"
          />
        )}

        <DashboardPageTabs
          pages={pages}
          activePageId={activePageId}
          onSelect={onSelectPage}
          className="max-w-[45%]"
        />

        {/* Filtros globais — linha única com rolagem em telas médias+ */}
        {filters.length > 0 && (
          <div className="hidden min-w-0 flex-1 overflow-x-auto md:flex">
            <DashboardFiltersBar
              filters={filters}
              editing={false}
              filterValues={filterValues}
              loadingDistinct={loadingDistinct}
              distinctValues={distinctValues}
              onValueChange={onFilterValueChange}
              wrap={false}
            />
          </div>
        )}

        {/* Filtros em telas pequenas: painel acima da barra (um único toque) */}
        {filters.length > 0 && (
          <div className="relative md:hidden">
            <Button
              variant="outline"
              size="icon-sm"
              title="Filtros do painel"
              aria-label="Filtros do painel"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <SlidersHorizontal size={14} />
            </Button>
            {filtersOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  aria-hidden
                  onClick={() => setFiltersOpen(false)}
                />
                <div className="absolute right-0 bottom-full z-50 mb-2 w-[min(calc(100vw-1.5rem),20rem)] rounded-lg border border-border bg-card p-3 shadow-lg">
                  <div className="max-h-[50vh] overflow-y-auto">{filtersBar}</div>
                </div>
              </>
            )}
          </div>
        )}

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
