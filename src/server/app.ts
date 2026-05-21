import { Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import type { Context } from 'hono'
import type {
  CreateExchangeRequest,
  Currency,
  ExchangeAccount,
  ExchangeType,
  UpdateExchangeRequest,
} from '../shared/types'
import { createJwt, decryptSecret, encryptSecret, verifyJwt, verifyPassword } from './crypto'
import { fetchExchangeBalances } from './exchanges'

type Bindings = {
  DB: D1Database
  ADMIN_EMAIL: string
  ADMIN_PASSWORD_HASH: string
  JWT_SECRET: string
  ENCRYPTION_KEY: string
}

type AppVariables = {
  userEmail: string
}

type AccountRow = {
  id: string
  exchange: ExchangeType
  name: string
  api_key_encrypted: string
  secret_key_encrypted: string
  passphrase_encrypted: string | null
  created_at: string
  updated_at: string
  last_synced_at: string | null
}

type BalanceRow = {
  id: string
  exchange_account_id: string
  exchange_name: string
  exchange: ExchangeType
  asset: string
  available: number
  frozen: number
  total: number
  usdt_value: number
  synced_at: string
}

const app = new Hono<{ Bindings: Bindings; Variables: AppVariables }>()

const currencies: Currency[] = ['USDT', 'USD', 'CNY']
const cookieName = 'asset_session'

app.post('/api/auth/login', async (c) => {
  const body = (await c.req.json<{ email?: string; password?: string }>().catch(() => ({}))) as {
    email?: string
    password?: string
  }
  const email = body.email?.trim()
  const password = body.password ?? ''
  if (!email || !password) return c.json({ error: '请输入邮箱和密码' }, 400)
  if (email !== c.env.ADMIN_EMAIL) return c.json({ error: '账号或密码错误' }, 401)

  const ok = await verifyPassword(password, c.env.ADMIN_PASSWORD_HASH)
  if (!ok) return c.json({ error: '账号或密码错误' }, 401)

  const token = await createJwt({ sub: email }, c.env.JWT_SECRET, 60 * 60 * 24 * 7)
  setCookie(c, cookieName, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
  return c.json({ ok: true })
})

app.post('/api/auth/logout', (c) => {
  setCookie(c, cookieName, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 0,
  })
  return c.json({ ok: true })
})

app.use('/api/*', async (c, next) => {
  if (c.req.path === '/api/auth/login') return next()
  const token = getCookie(c, cookieName)
  if (!token) return c.json({ error: '请先登录' }, 401)
  const payload = await verifyJwt<{ sub?: string }>(token, c.env.JWT_SECRET)
  if (!payload?.sub) return c.json({ error: '登录已过期' }, 401)
  c.set('userEmail', payload.sub)
  return next()
})

app.get('/api/auth/me', (c) => c.json({ email: c.get('userEmail') }))

app.get('/api/exchanges', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT id, exchange, name, api_key_encrypted, secret_key_encrypted, passphrase_encrypted,
      created_at, updated_at, last_synced_at
     FROM exchange_accounts
     ORDER BY created_at DESC`,
  ).all<AccountRow>()
  return c.json(rows.results.map(publicAccount))
})

app.post('/api/exchanges', async (c) => {
  const body = await c.req.json<CreateExchangeRequest>().catch(() => null)
  const error = validateCreateExchange(body)
  if (error) return c.json({ error }, 400)
  if (!body) return c.json({ error: '请求体格式错误' }, 400)

  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  await c.env.DB.prepare(
    `INSERT INTO exchange_accounts
      (id, exchange, name, api_key_encrypted, secret_key_encrypted, passphrase_encrypted, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      body.exchange,
      body.name.trim(),
      await encryptSecret(body.apiKey.trim(), c.env.ENCRYPTION_KEY),
      await encryptSecret(body.secretKey.trim(), c.env.ENCRYPTION_KEY),
      body.passphrase?.trim() ? await encryptSecret(body.passphrase.trim(), c.env.ENCRYPTION_KEY) : null,
      now,
      now,
    )
    .run()

  return c.json({
    id,
    exchange: body.exchange,
    name: body.name.trim(),
    createdAt: now,
    updatedAt: now,
    lastSyncedAt: null,
  } satisfies ExchangeAccount)
})

app.patch('/api/exchanges/:id', async (c) => {
  const body = await c.req.json<UpdateExchangeRequest>().catch(() => null)
  const name = body?.name?.trim()
  if (!name) return c.json({ error: '请输入交易所名称' }, 400)

  const now = new Date().toISOString()
  const result = await c.env.DB.prepare('UPDATE exchange_accounts SET name = ?, updated_at = ? WHERE id = ?')
    .bind(name, now, c.req.param('id'))
    .run()
  if (result.meta.changes === 0) return c.json({ error: '交易所不存在' }, 404)

  const row = await findAccount(c, c.req.param('id'))
  return c.json(publicAccount(row))
})

app.delete('/api/exchanges/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM asset_balances WHERE exchange_account_id = ?').bind(c.req.param('id')).run()
  const result = await c.env.DB.prepare('DELETE FROM exchange_accounts WHERE id = ?').bind(c.req.param('id')).run()
  if (result.meta.changes === 0) return c.json({ error: '交易所不存在' }, 404)
  return c.json({ ok: true })
})

app.post('/api/exchanges/:id/sync', async (c) => {
  const row = await findAccount(c, c.req.param('id'))
  const credentials = {
    apiKey: await decryptSecret(row.api_key_encrypted, c.env.ENCRYPTION_KEY),
    secretKey: await decryptSecret(row.secret_key_encrypted, c.env.ENCRYPTION_KEY),
    passphrase: row.passphrase_encrypted
      ? await decryptSecret(row.passphrase_encrypted, c.env.ENCRYPTION_KEY)
      : undefined,
  }
  const balances = await fetchExchangeBalances(row.exchange, credentials)
  const syncedAt = new Date().toISOString()

  await c.env.DB.prepare('DELETE FROM asset_balances WHERE exchange_account_id = ?').bind(row.id).run()
  const statements = balances.map((balance) =>
    c.env.DB.prepare(
      `INSERT INTO asset_balances
        (id, exchange_account_id, asset, available, frozen, total, usdt_value, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      row.id,
      balance.asset,
      balance.available,
      balance.frozen,
      balance.total,
      balance.usdtValue,
      syncedAt,
    ),
  )
  if (statements.length > 0) await c.env.DB.batch(statements)
  await c.env.DB.prepare('UPDATE exchange_accounts SET last_synced_at = ?, updated_at = ? WHERE id = ?')
    .bind(syncedAt, syncedAt, row.id)
    .run()

  return c.json({ syncedAt, assetCount: balances.length })
})

app.get('/api/dashboard', async (c) => {
  const currency = getCurrency(c)
  const rate = await getCurrencyRate(currency)
  const exchangeRows = await c.env.DB.prepare(
    `SELECT ea.id, ea.exchange, ea.name, ea.created_at, ea.updated_at, ea.last_synced_at,
      COALESCE(SUM(ab.usdt_value), 0) as usdt_value,
      COUNT(ab.id) as asset_count
     FROM exchange_accounts ea
     LEFT JOIN asset_balances ab ON ab.exchange_account_id = ea.id
     GROUP BY ea.id
     ORDER BY ea.created_at DESC`,
  ).all<AccountRow & { usdt_value: number; asset_count: number }>()
  const assetRows = await c.env.DB.prepare(
    `SELECT asset, SUM(total) as total, SUM(usdt_value) as usdt_value
     FROM asset_balances
     GROUP BY asset
     HAVING SUM(total) > 0
     ORDER BY usdt_value DESC`,
  ).all<{ asset: string; total: number; usdt_value: number }>()

  const totalUsdtValue = exchangeRows.results.reduce((sum, row) => sum + Number(row.usdt_value), 0)
  const lastSyncedAt = exchangeRows.results
    .map((row) => row.last_synced_at)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null

  return c.json({
    currency,
    totalUsdtValue,
    totalDisplayValue: totalUsdtValue * rate,
    rate,
    exchanges: exchangeRows.results.map((row) => ({
      ...publicAccount(row),
      usdtValue: Number(row.usdt_value),
      displayValue: Number(row.usdt_value) * rate,
      assetCount: Number(row.asset_count),
    })),
    assets: assetRows.results.map((row) => ({
      asset: row.asset,
      total: Number(row.total),
      usdtValue: Number(row.usdt_value),
      displayValue: Number(row.usdt_value) * rate,
    })),
    lastSyncedAt,
  })
})

app.get('/api/exchanges/:id/balances', async (c) => {
  const currency = getCurrency(c)
  const rate = await getCurrencyRate(currency)
  const account = await findAccount(c, c.req.param('id'))
  const rows = await c.env.DB.prepare(
    `SELECT ab.id, ab.exchange_account_id, ea.name as exchange_name, ea.exchange,
      ab.asset, ab.available, ab.frozen, ab.total, ab.usdt_value, ab.synced_at
     FROM asset_balances ab
     JOIN exchange_accounts ea ON ea.id = ab.exchange_account_id
     WHERE ab.exchange_account_id = ?
     ORDER BY ab.usdt_value DESC`,
  )
    .bind(account.id)
    .all<BalanceRow>()
  const totalUsdt = rows.results.reduce((sum, row) => sum + Number(row.usdt_value), 0)

  return c.json({
    account: publicAccount(account),
    balances: rows.results.map((row) => ({
      id: row.id,
      exchangeAccountId: row.exchange_account_id,
      exchangeName: row.exchange_name,
      exchange: row.exchange,
      asset: row.asset,
      available: Number(row.available),
      frozen: Number(row.frozen),
      total: Number(row.total),
      usdtValue: Number(row.usdt_value),
      displayValue: Number(row.usdt_value) * rate,
      currency,
      syncedAt: row.synced_at,
    })),
    totals: {
      usdtValue: totalUsdt,
      displayValue: totalUsdt * rate,
    },
  })
})

app.notFound((c) => c.json({ error: '接口不存在' }, 404))

app.onError((error, c) => {
  if (error instanceof Response) return error
  return c.json({ error: error instanceof Error ? error.message : '服务器错误' }, 500)
})

function publicAccount(row: AccountRow): ExchangeAccount {
  return {
    id: row.id,
    exchange: row.exchange,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSyncedAt: row.last_synced_at,
  }
}

async function findAccount(c: Context<{ Bindings: Bindings; Variables: AppVariables }>, id: string) {
  const row = await c.env.DB.prepare(
    `SELECT id, exchange, name, api_key_encrypted, secret_key_encrypted, passphrase_encrypted,
      created_at, updated_at, last_synced_at
     FROM exchange_accounts
     WHERE id = ?`,
  )
    .bind(id)
    .first<AccountRow>()
  if (!row) throw new Response(JSON.stringify({ error: '交易所不存在' }), { status: 404 })
  return row
}

function validateCreateExchange(body: CreateExchangeRequest | null) {
  if (!body) return '请求体格式错误'
  if (!['binance', 'okx'].includes(body.exchange)) return '暂不支持该交易所'
  if (!body.name?.trim()) return '请输入自定义名称'
  if (!body.apiKey?.trim()) return '请输入 API Key'
  if (!body.secretKey?.trim()) return '请输入 Secret Key'
  if (body.exchange === 'okx' && !body.passphrase?.trim()) return 'OKX Passphrase 必填'
  return ''
}

function getCurrency(c: Context) {
  const currency = c.req.query('currency')?.toUpperCase() as Currency | undefined
  return currency && currencies.includes(currency) ? currency : 'USDT'
}

async function getCurrencyRate(currency: Currency) {
  if (currency === 'USDT' || currency === 'USD') return 1
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD')
    const data = (await res.json()) as { rates?: { CNY?: number } }
    return data.rates?.CNY ?? 1
  } catch {
    return 1
  }
}

export default app
