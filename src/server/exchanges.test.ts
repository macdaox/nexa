import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchBinanceBalances, fetchOkxBalances } from './exchanges'

describe('exchange adapters', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('normalizes non-zero Binance balances with USDT prices', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/api/v3/account')) {
        return jsonResponse({
          balances: [
            { asset: 'BTC', free: '0.5', locked: '0.1' },
            { asset: 'ETH', free: '0', locked: '0' },
            { asset: 'USDT', free: '120', locked: '0' },
          ],
        })
      }
      if (url.includes('BTCUSDT')) return jsonResponse({ price: '60000' })
      return jsonResponse({ price: '0' })
    })

    const balances = await fetchBinanceBalances({ apiKey: 'key', secretKey: 'secret' })

    expect(balances).toEqual([
      { asset: 'BTC', available: 0.5, frozen: 0.1, total: 0.6, usdtValue: 36000 },
      { asset: 'USDT', available: 120, frozen: 0, total: 120, usdtValue: 120 },
    ])
  })

  it('normalizes OKX balances using eqUsd when present', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: [
          {
            details: [
              { ccy: 'SOL', availBal: '10', frozenBal: '2', eq: '12', eqUsd: '1800' },
              { ccy: 'USDT', availBal: '5', frozenBal: '0', eq: '5', eqUsd: '5' },
            ],
          },
        ],
      }),
    )

    const balances = await fetchOkxBalances({ apiKey: 'key', secretKey: 'secret', passphrase: 'pass' })

    expect(balances).toEqual([
      { asset: 'SOL', available: 10, frozen: 2, total: 12, usdtValue: 1800 },
      { asset: 'USDT', available: 5, frozen: 0, total: 5, usdtValue: 5 },
    ])
  })
})

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  })
}
