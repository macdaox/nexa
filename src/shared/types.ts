export type ExchangeType = 'binance' | 'okx'

export type Currency = 'USDT' | 'USD' | 'CNY'

export type ExchangeAccount = {
  id: string
  exchange: ExchangeType
  name: string
  createdAt: string
  updatedAt: string
  lastSyncedAt: string | null
}

export type AssetBalance = {
  id: string
  exchangeAccountId: string
  exchangeName: string
  exchange: ExchangeType
  asset: string
  available: number
  frozen: number
  total: number
  usdtValue: number
  displayValue: number
  currency: Currency
  syncedAt: string
}

export type AssetSummary = {
  asset: string
  total: number
  usdtValue: number
  displayValue: number
}

export type DashboardResponse = {
  currency: Currency
  totalUsdtValue: number
  totalDisplayValue: number
  rate: number
  exchanges: Array<ExchangeAccount & {
    usdtValue: number
    displayValue: number
    assetCount: number
  }>
  assets: AssetSummary[]
  lastSyncedAt: string | null
}

export type ExchangeBalancesResponse = {
  account: ExchangeAccount
  balances: AssetBalance[]
  totals: {
    usdtValue: number
    displayValue: number
  }
}

export type CreateExchangeRequest = {
  exchange: ExchangeType
  name: string
  apiKey: string
  secretKey: string
  passphrase?: string
}

export type UpdateExchangeRequest = {
  name: string
}

export type LoginRequest = {
  email: string
  password: string
}

export type ApiError = {
  error: string
}
