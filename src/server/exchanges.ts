import type { ExchangeType } from '../shared/types'
import { hmacSha256Base64, hmacSha256Hex } from './crypto'

export type ExchangeCredentials = {
  apiKey: string
  secretKey: string
  passphrase?: string
}

export type NormalizedBalance = {
  asset: string
  available: number
  frozen: number
  total: number
  usdtValue: number
}

type BinanceAccountResponse = {
  balances: Array<{ asset: string; free: string; locked: string }>
}

type BinanceTickerResponse = {
  price: string
}

type OkxBalanceResponse = {
  data?: Array<{
    details?: Array<{
      ccy: string
      availBal?: string
      frozenBal?: string
      cashBal?: string
      eq?: string
      eqUsd?: string
    }>
  }>
}

type OkxTickerResponse = {
  data?: Array<{ last: string }>
}

const binanceBase = 'https://api.binance.com'
const okxBase = 'https://www.okx.com'

function toNumber(value: string | number | undefined) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export async function fetchExchangeBalances(exchange: ExchangeType, credentials: ExchangeCredentials) {
  if (exchange === 'binance') return fetchBinanceBalances(credentials)
  return fetchOkxBalances(credentials)
}

export async function fetchBinanceBalances(credentials: ExchangeCredentials): Promise<NormalizedBalance[]> {
  const timestamp = Date.now()
  const query = new URLSearchParams({ timestamp: String(timestamp), recvWindow: '5000' })
  const signature = await hmacSha256Hex(credentials.secretKey, query.toString())
  query.set('signature', signature)

  const accountRes = await fetch(`${binanceBase}/api/v3/account?${query.toString()}`, {
    headers: { 'X-MBX-APIKEY': credentials.apiKey },
  })
  if (!accountRes.ok) throw new Error(`Binance 余额读取失败：${accountRes.status}`)

  const account = (await accountRes.json()) as BinanceAccountResponse
  const nonZero = account.balances
    .map((item) => ({
      asset: item.asset,
      available: toNumber(item.free),
      frozen: toNumber(item.locked),
      total: toNumber(item.free) + toNumber(item.locked),
    }))
    .filter((item) => item.total > 0)

  const priced = await Promise.all(
    nonZero.map(async (item) => ({
      ...item,
      usdtValue: item.asset === 'USDT' ? item.total : item.total * (await fetchBinanceUsdtPrice(item.asset)),
    })),
  )

  return priced.filter((item) => item.total > 0)
}

async function fetchBinanceUsdtPrice(asset: string) {
  const res = await fetch(`${binanceBase}/api/v3/ticker/price?symbol=${asset}USDT`)
  if (!res.ok) return 0
  const data = (await res.json()) as BinanceTickerResponse
  return toNumber(data.price)
}

export async function fetchOkxBalances(credentials: ExchangeCredentials): Promise<NormalizedBalance[]> {
  if (!credentials.passphrase) throw new Error('OKX Passphrase 必填')

  const timestamp = new Date().toISOString()
  const requestPath = '/api/v5/account/balance'
  const signature = await hmacSha256Base64(credentials.secretKey, `${timestamp}GET${requestPath}`)
  const res = await fetch(`${okxBase}${requestPath}`, {
    headers: {
      'OK-ACCESS-KEY': credentials.apiKey,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': credentials.passphrase,
    },
  })
  if (!res.ok) throw new Error(`OKX 余额读取失败：${res.status}`)

  const data = (await res.json()) as OkxBalanceResponse
  const details = data.data?.flatMap((item) => item.details ?? []) ?? []
  const nonZero = details
    .map((item) => {
      const total = toNumber(item.eq ?? item.cashBal)
      return {
        asset: item.ccy,
        available: toNumber(item.availBal),
        frozen: toNumber(item.frozenBal),
        total,
        usdtValue: toNumber(item.eqUsd),
      }
    })
    .filter((item) => item.total > 0)

  return Promise.all(
    nonZero.map(async (item) => ({
      ...item,
      usdtValue:
        item.usdtValue > 0
          ? item.usdtValue
          : item.asset === 'USDT'
            ? item.total
            : item.total * (await fetchOkxUsdtPrice(item.asset)),
    })),
  )
}

async function fetchOkxUsdtPrice(asset: string) {
  const res = await fetch(`${okxBase}/api/v5/market/ticker?instId=${asset}-USDT`)
  if (!res.ok) return 0
  const data = (await res.json()) as OkxTickerResponse
  return toNumber(data.data?.[0]?.last)
}
