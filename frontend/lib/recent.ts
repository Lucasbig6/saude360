/**
 * Recência local (localStorage) de itens abertos pelo usuário.
 *
 * A ordenação por "últimos vistos" é uma preferência do cliente — nada é
 * gravado no servidor — por isso vive aqui, com escrita silenciosa.
 */

const PREFIX = "monisus_recent_"
const LIMIT = 12

function key(kind: string): string {
  return `${PREFIX}${kind}`
}

function read(kind: string): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(key(kind))
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : []
  } catch {
    return []
  }
}

/** Ids mais recentes primeiro. */
export function readRecentIds(kind: string): string[] {
  return read(kind)
}

export function recordRecentId(kind: string, id: string): void {
  if (typeof window === "undefined") return
  try {
    const next = [id, ...read(kind).filter((value) => value !== id)].slice(
      0,
      LIMIT
    )
    window.localStorage.setItem(key(kind), JSON.stringify(next))
  } catch {
    // storage indisponível (modo privado/quota): a recência fica sem efeito
  }
}
