import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Coins,
  EyeOff,
  KeyRound,
  Loader2,
  LogOut,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  Trash2,
  Wallet,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { api } from './lib/api'
import type {
  Currency,
  DashboardResponse,
  ExchangeAccount,
  ExchangeBalancesResponse,
  ExchangeType,
} from './shared/types'
import './App.css'

type Route =
  | { name: 'login' }
  | { name: 'dashboard' }
  | { name: 'settings' }
  | { name: 'exchange'; id: string }

const currencySymbols: Record<Currency, string> = {
  USDT: 'USDT',
  USD: 'USD',
  CNY: 'CNY',
}

function parseRoute(): Route {
  const { pathname } = window.location
  if (pathname === '/login') return { name: 'login' }
  if (pathname === '/settings') return { name: 'settings' }
  const exchangeMatch = pathname.match(/^\/exchanges\/([^/]+)$/)
  if (exchangeMatch) return { name: 'exchange', id: exchangeMatch[1] }
  return { name: 'dashboard' }
}

function navigate(path: string) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function formatMoney(value: number, currency: Currency) {
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: currency === 'CNY' ? 2 : 4,
    minimumFractionDigits: 2,
  }).format(value)
}

function formatAmount(value: number) {
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: 8,
  }).format(value)
}

function App() {
  const [route, setRoute] = useState<Route>(parseRoute)
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    const onPop = () => setRoute(parseRoute())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    api
      .me()
      .then(() => {
        setAuthed(true)
        if (parseRoute().name === 'login') navigate('/dashboard')
      })
      .catch(() => {
        setAuthed(false)
        if (parseRoute().name !== 'login') navigate('/login')
      })
  }, [])

  const onLogin = () => {
    setAuthed(true)
    navigate('/dashboard')
  }

  const onLogout = async () => {
    await api.logout().catch(() => undefined)
    setAuthed(false)
    navigate('/login')
  }

  if (authed === null) {
    return <FullScreenLoader />
  }

  if (!authed || route.name === 'login') {
    return <LoginPage onLogin={onLogin} />
  }

  return (
    <Shell route={route} onLogout={onLogout}>
      {route.name === 'dashboard' && <DashboardPage />}
      {route.name === 'settings' && <SettingsPage />}
      {route.name === 'exchange' && <ExchangePage id={route.id} />}
    </Shell>
  )
}

function FullScreenLoader() {
  return (
    <main className="screen-center">
      <Loader2 className="spin" size={28} />
      <span>正在加载资产看板</span>
    </main>
  )
}

function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.login({ email, password })
      onLogin()
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-screen">
      <section className="login-panel">
        <div className="brand-mark">
          <Wallet size={30} />
        </div>
        <h1>资产看板</h1>
        <p className="muted">私人多交易所余额 H5 / PWA</p>
        <form className="form-stack" onSubmit={submit}>
          <label>
            邮箱 / 用户名
            <input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" />
          </label>
          <label>
            密码
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
            />
          </label>
          {error && <InlineError message={error} />}
          <button className="primary-btn" disabled={loading} type="submit">
            {loading ? <Loader2 className="spin" size={18} /> : <KeyRound size={18} />}
            登录
          </button>
        </form>
      </section>
    </main>
  )
}

function Shell({
  children,
  onLogout,
  route,
}: {
  children: ReactNode
  onLogout: () => void
  route: Route
}) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="icon-btn" onClick={() => navigate('/dashboard')} title="总览" type="button">
          <Wallet size={22} />
        </button>
        <div>
          <strong>资产看板</strong>
          <span>Read Only</span>
        </div>
        <button className="icon-btn" onClick={onLogout} title="退出登录" type="button">
          <LogOut size={20} />
        </button>
      </header>
      <main className="content">{children}</main>
      <nav className="bottom-nav">
        <NavButton active={route.name === 'dashboard'} icon={<BarChart3 size={20} />} label="总览" path="/dashboard" />
        <NavButton active={route.name === 'settings'} icon={<Settings size={20} />} label="设置" path="/settings" />
      </nav>
    </div>
  )
}

function NavButton({ active, icon, label, path }: { active: boolean; icon: ReactNode; label: string; path: string }) {
  return (
    <button className={active ? 'nav-btn active' : 'nav-btn'} onClick={() => navigate(path)} type="button">
      {icon}
      {label}
    </button>
  )
}

function DashboardPage() {
  const [currency, setCurrency] = useState<Currency>('USDT')
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [syncingId, setSyncingId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await api.dashboard(currency))
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [currency])

  useEffect(() => {
    void load()
  }, [load])

  const sync = async (id: string) => {
    setSyncingId(id)
    try {
      await api.syncExchange(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '同步失败')
    } finally {
      setSyncingId('')
    }
  }

  return (
    <section className="page-stack">
      <div className="hero-band">
        <div className="hero-row">
          <div>
            <span className="eyebrow">总资产</span>
            <h2>
              {data ? formatMoney(data.totalDisplayValue, currency) : '0.00'} {currencySymbols[currency]}
            </h2>
          </div>
          <CurrencyPicker value={currency} onChange={setCurrency} />
        </div>
        <p className="muted">最后同步：{data?.lastSyncedAt ? new Date(data.lastSyncedAt).toLocaleString() : '尚未同步'}</p>
      </div>

      {error && <InlineError message={error} />}
      {loading && <LoadingLine />}

      <div className="section-heading">
        <h3>交易所</h3>
        <button className="ghost-btn" onClick={() => navigate('/settings')} type="button">
          <Settings size={16} />
          管理
        </button>
      </div>

      <div className="card-grid">
        {data?.exchanges.map((item) => (
          <article className="exchange-card" key={item.id}>
            <button className="card-main" onClick={() => navigate(`/exchanges/${item.id}`)} type="button">
              <div>
                <strong>{item.name}</strong>
                <span>{item.exchange.toUpperCase()} · {item.assetCount} 个资产</span>
              </div>
              <ChevronRight size={18} />
            </button>
            <div className="card-value">
              {formatMoney(item.displayValue, currency)} {currency}
            </div>
            <button className="ghost-btn full" disabled={syncingId === item.id} onClick={() => sync(item.id)} type="button">
              {syncingId === item.id ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
              刷新资产
            </button>
          </article>
        ))}
      </div>

      {!loading && data?.exchanges.length === 0 && <EmptyState text="还没有添加交易所 API，请到设置页添加。" />}

      <div className="section-heading">
        <h3>币种汇总</h3>
      </div>
      <div className="asset-list">
        {data?.assets.map((asset) => (
          <div className="asset-row" key={asset.asset}>
            <div className="coin-dot">{asset.asset.slice(0, 1)}</div>
            <div>
              <strong>{asset.asset}</strong>
              <span>{formatAmount(asset.total)}</span>
            </div>
            <b>
              {formatMoney(asset.displayValue, currency)} {currency}
            </b>
          </div>
        ))}
      </div>
    </section>
  )
}

function ExchangePage({ id }: { id: string }) {
  const [currency, setCurrency] = useState<Currency>('USDT')
  const [data, setData] = useState<ExchangeBalancesResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setError('')
    api
      .exchangeBalances(id, currency)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : '加载失败'))
      .finally(() => setLoading(false))
  }, [currency, id])

  return (
    <section className="page-stack">
      <button className="ghost-btn back" onClick={() => navigate('/dashboard')} type="button">
        返回总览
      </button>
      <div className="hero-band compact">
        <div className="hero-row">
          <div>
            <span className="eyebrow">{data?.account.exchange.toUpperCase() ?? 'EXCHANGE'}</span>
            <h2>{data?.account.name ?? '交易所详情'}</h2>
          </div>
          <CurrencyPicker value={currency} onChange={setCurrency} />
        </div>
        <p className="muted">
          合计 {formatMoney(data?.totals.displayValue ?? 0, currency)} {currency}
        </p>
      </div>
      {loading && <LoadingLine />}
      {error && <InlineError message={error} />}
      <div className="asset-list">
        {data?.balances.map((balance) => (
          <div className="balance-row" key={balance.asset}>
            <div>
              <strong>{balance.asset}</strong>
              <span>可用 {formatAmount(balance.available)} · 冻结 {formatAmount(balance.frozen)}</span>
            </div>
            <div>
              <b>{formatAmount(balance.total)}</b>
              <span>
                约 {formatMoney(balance.displayValue, currency)} {currency}
              </span>
            </div>
          </div>
        ))}
      </div>
      {!loading && data?.balances.length === 0 && <EmptyState text="这个交易所还没有同步到余额。" />}
    </section>
  )
}

function SettingsPage() {
  const [accounts, setAccounts] = useState<ExchangeAccount[]>([])
  const [exchange, setExchange] = useState<ExchangeType>('binance')
  const [name, setName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [editingNames, setEditingNames] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await api.exchanges()
      setAccounts(list)
      setEditingNames(Object.fromEntries(list.map((item) => [item.id, item.name])))
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setNotice('')
    try {
      await api.createExchange({ exchange, name, apiKey, secretKey, passphrase })
      setName('')
      setApiKey('')
      setSecretKey('')
      setPassphrase('')
      setNotice('交易所 API 已加密保存')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    }
  }

  const updateName = async (id: string) => {
    setError('')
    setNotice('')
    try {
      await api.updateExchange(id, { name: editingNames[id] })
      setNotice('名称已更新')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新失败')
    }
  }

  const remove = async (id: string) => {
    setError('')
    setNotice('')
    try {
      await api.deleteExchange(id)
      setNotice('交易所已删除')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    }
  }

  const defaultName = useMemo(() => (exchange === 'binance' ? '我的 Binance 主账户' : '我的 OKX 主账户'), [exchange])

  return (
    <section className="page-stack">
      <div className="section-heading">
        <h2>用户中心</h2>
      </div>

      <div className="security-note">
        <ShieldCheck size={22} />
        <span>只保存 Read Only API。请不要开启交易、提现或划转权限。</span>
      </div>

      <form className="settings-form" onSubmit={submit}>
        <label>
          交易所
          <select value={exchange} onChange={(event) => setExchange(event.target.value as ExchangeType)}>
            <option value="binance">Binance</option>
            <option value="okx">OKX</option>
          </select>
        </label>
        <label>
          自定义名称
          <input placeholder={defaultName} value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          API Key
          <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="off" />
        </label>
        <label>
          Secret Key
          <input value={secretKey} onChange={(event) => setSecretKey(event.target.value)} autoComplete="off" />
        </label>
        <label>
          Passphrase
          <input
            placeholder="OKX 必填"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            autoComplete="off"
          />
        </label>
        <button className="primary-btn" type="submit">
          <Save size={18} />
          加密保存
        </button>
      </form>

      {notice && <InlineSuccess message={notice} />}
      {error && <InlineError message={error} />}
      {loading && <LoadingLine />}

      <div className="section-heading">
        <h3>已保存 API</h3>
      </div>
      <div className="account-list">
        {accounts.map((account) => (
          <article className="account-item" key={account.id}>
            <div className="account-meta">
              <Coins size={18} />
              <span>{account.exchange.toUpperCase()}</span>
              <small>{account.lastSyncedAt ? new Date(account.lastSyncedAt).toLocaleString() : '尚未同步'}</small>
            </div>
            <div className="account-actions">
              <input
                value={editingNames[account.id] ?? account.name}
                onChange={(event) => setEditingNames((state) => ({ ...state, [account.id]: event.target.value }))}
              />
              <button className="icon-btn" title="保存名称" onClick={() => updateName(account.id)} type="button">
                <Save size={17} />
              </button>
              <button className="icon-btn danger" title="删除" onClick={() => remove(account.id)} type="button">
                <Trash2 size={17} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {!loading && accounts.length === 0 && <EmptyState text="还没有保存任何交易所 API。" />}
    </section>
  )
}

function CurrencyPicker({ value, onChange }: { value: Currency; onChange: (currency: Currency) => void }) {
  return (
    <div className="segmented">
      {(['USDT', 'USD', 'CNY'] as Currency[]).map((currency) => (
        <button
          className={value === currency ? 'active' : ''}
          key={currency}
          onClick={() => onChange(currency)}
          type="button"
        >
          {currency}
        </button>
      ))}
    </div>
  )
}

function InlineError({ message }: { message: string }) {
  return (
    <div className="inline-message error">
      <AlertCircle size={18} />
      {message}
    </div>
  )
}

function InlineSuccess({ message }: { message: string }) {
  return (
    <div className="inline-message success">
      <CheckCircle2 size={18} />
      {message}
    </div>
  )
}

function LoadingLine() {
  return (
    <div className="inline-message">
      <Loader2 className="spin" size={18} />
      正在加载
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <EyeOff size={24} />
      <span>{text}</span>
    </div>
  )
}

export default App
