import { apiGet, apiPost, ApiError } from "./api"

const ACCESS_TOKEN_KEY = "monisus_access_token"
const REFRESH_TOKEN_KEY = "monisus_refresh_token"

export interface LoginResponse {
  access_token: string
  refresh_token: string
}

export interface MeResponse {
  /** uuid local do usuário; null quando ainda não existe registro local. */
  id: string | null
  sub: string | null
  type?: string
  fresh?: boolean
  iat?: number
  exp?: number
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  return apiPost<LoginResponse>("/api/auth/login", { username, password })
}

export function saveTokens(data: LoginResponse): void {
  if (data.access_token) {
    localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token)
  }
  if (data.refresh_token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token)
  }
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(ACCESS_TOKEN_KEY)
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

export function clearTokens(): void {
  if (typeof window === "undefined") return
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  clearMeCache()
}

/** Perfil do usuário logado (id local + sub do JWT), com cache por sessão. */
let meCache: Promise<MeResponse> | null = null

export function getMe(): Promise<MeResponse> {
  if (!meCache) {
    meCache = apiGet<MeResponse>("/api/auth/me").catch((err) => {
      meCache = null
      throw err
    })
  }
  return meCache
}

export function clearMeCache(): void {
  meCache = null
}

/**
 * `sub` do token (username) direto do JWT — evita uma chamada de rede
 * quando só é preciso exibir o nome de quem está logado.
 */
export function getCurrentUsername(): string | null {
  const token = getAccessToken()
  if (!token) return null
  const payload = decodeJwtPayload(token)
  const sub = payload?.sub
  return typeof sub === "string" && sub ? sub : null
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")
    return JSON.parse(atob(padded))
  } catch {
    return null
  }
}

export function isAuthenticated(): boolean {
  const token = getAccessToken()
  if (!token) return false

  const payload = decodeJwtPayload(token)
  if (!payload) return false

  const now = Math.floor(Date.now() / 1000)
  const exp = typeof payload.exp === "number" ? payload.exp : null
  return exp ? exp > now : true
}

export { ApiError }
