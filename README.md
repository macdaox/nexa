# 资产看板

私人多交易所资产余额 H5 / PWA，前端使用 React + Vite + TypeScript，后端使用 Cloudflare Pages Functions + Hono，数据库使用 Cloudflare D1。

## 功能

- 单管理员登录，JWT 写入 HttpOnly Cookie。
- Binance / OKX Read Only API Key 加密保存。
- 手动同步交易所余额，只读取资产，不包含交易、提现、划转接口。
- Dashboard 汇总 USDT / USD / CNY 估值。
- iPhone 添加到桌面所需的 manifest、Apple touch icon、safe-area 支持。

## 本地开发

```bash
npm install
cp .dev.vars.example .dev.vars
node scripts/generate-secrets.mjs "你的管理员密码"
npm run dev
```

把脚本输出填入 `.dev.vars`，并设置 `ADMIN_EMAIL`。本地 D1 可用 Wrangler 绑定后运行：

```bash
npx wrangler d1 create asset-dashboard
npx wrangler d1 migrations apply asset-dashboard --local
npx wrangler pages dev dist --d1 DB=asset-dashboard
```

## Cloudflare 部署

1. 创建 D1 数据库并把真实 `database_id` 填入 `wrangler.toml`。
2. 在 Cloudflare Pages 设置环境变量：`ADMIN_EMAIL`、`ADMIN_PASSWORD_HASH`、`JWT_SECRET`、`ENCRYPTION_KEY`。
3. 执行 D1 migration：`npx wrangler d1 migrations apply asset-dashboard --remote`。
4. Pages 构建命令：`npm run build`，输出目录：`dist`。

## 检查

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```
