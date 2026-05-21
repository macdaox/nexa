import type {
  CreateExchangeRequest,
  Currency,
  DashboardResponse,
  ExchangeAccount,
  ExchangeBalancesResponse,
  LoginRequest,
  UpdateExchangeRequest,
} from '../shared/types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...init?.headers,
    },
    ...init,
  })

  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: '请求失败' }))) as { error?: string }
    throw new Error(body.error ?? '请求失败')
  }

  return res.json() as Promise<T>
}

export const api = {
  login(payload: LoginRequest) {
    return request<{ ok: true }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  logout() {
    return request<{ ok: true }>('/api/auth/logout', { method: 'POST' })
  },
  me() {
    return request<{ email: string }>('/api/auth/me')
  },
  dashboard(currency: Currency) {
    return request<DashboardResponse>(`/api/dashboard?currency=${currency}`)
  },
  exchanges() {
    return request<ExchangeAccount[]>('/api/exchanges')
  },
  createExchange(payload: CreateExchangeRequest) {
    return request<ExchangeAccount>('/api/exchanges', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  updateExchange(id: string, payload: UpdateExchangeRequest) {
    return request<ExchangeAccount>(`/api/exchanges/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  },
  deleteExchange(id: string) {
    return request<{ ok: true }>(`/api/exchanges/${id}`, { method: 'DELETE' })
  },
  syncExchange(id: string) {
    return request<{ syncedAt: string; assetCount: number }>(`/api/exchanges/${id}/sync`, {
      method: 'POST',
    })
  },
  exchangeBalances(id: string, currency: Currency) {
    return request<ExchangeBalancesResponse>(`/api/exchanges/${id}/balances?currency=${currency}`)
  },
}
