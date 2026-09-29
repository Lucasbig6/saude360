import { getAccessToken, getRefreshToken, clearTokens, saveTokens, type LoginResponse } from "./auth"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

export class ApiError extends Error {
  status: number
  detail: string

  constructor(status: number, detail: string) {
    super(detail)
    this.name = "ApiError"
    this.status = status
    this.detail = detail
  }
}

function authHeaders(): Record<string, string> {
  const token = getAccessToken()
  if (token) {
    return { Authorization: `Bearer ${token}` }
  }
  return {}
}

let refreshPromise: Promise<boolean> | null = null

async function tryRefreshTokens(): Promise<boolean> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return false

  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        })
        if (!response.ok) return false
        const data = (await response.json()) as LoginResponse
        if (!data.access_token) return false
        saveTokens(data)
        return true
      } catch {
        return false
      } finally {
        refreshPromise = null
      }
    })()
  }

  return refreshPromise
}

function forceLogout(): void {
  if (typeof window !== "undefined") {
    clearTokens()
    if (window.location.pathname !== "/login") {
      // Hard navigation is intentional: clears all client state on auth failure.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/login"
    }
  }
}

async function handleUnauthorized(path: string): Promise<boolean> {
  if (path === "/api/auth/login" || path === "/api/auth/refresh") {
    return false
  }
  if (!getAccessToken()) {
    return false
  }
  const refreshed = await tryRefreshTokens()
  if (refreshed) return true
  forceLogout()
  return false
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  retried = false
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (response.status === 401 && !retried) {
    const recovered = await handleUnauthorized(path)
    if (recovered) {
      return request<T>(method, path, body, true)
    }
  }

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throwFromResponse(response, data, path)
  }

  return data as T
}

function throwFromResponse(response: Response, data: unknown, path: string): never {
  if (
    response.status === 401 &&
    path !== "/api/auth/login" &&
    path !== "/api/auth/refresh"
  ) {
    forceLogout()
  }
  const payload = (data ?? {}) as Record<string, unknown>
  const detail =
    typeof payload.detail === "string"
      ? payload.detail
      : typeof payload.message === "string"
        ? payload.message
        : "Erro desconhecido"
  throw new ApiError(response.status, detail)
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>("GET", path)
}

export function apiPut<T>(path: string, body: unknown): Promise<T> {
  return request<T>("PUT", path, body)
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>("POST", path, body)
}

export function apiDelete(path: string): Promise<void> {
  return request<void>("DELETE", path)
}

/**
 * Requisição que devolve o `Response` cru (para streaming SSE).
 * Mesma autenticação/refresh/erros de `apiPost`.
 */
export async function apiStream(
  path: string,
  body: unknown,
  options: { signal?: AbortSignal; method?: string } = {},
  retried = false
): Promise<Response> {
  const method = options.method ?? "POST"
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...authHeaders(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: options.signal,
    cache: "no-store",
  })

  if (response.status === 401 && !retried) {
    const recovered = await handleUnauthorized(path)
    if (recovered) {
      return apiStream(path, body, options, true)
    }
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throwFromResponse(response, data, path)
  }

  return response
}
