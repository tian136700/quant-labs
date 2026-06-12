# Strategy Compare Cloud

面向欧美用户的 **定投 vs RSI(6) 策略对比** 公共工具，独立部署于 Cloudflare Pages。

逻辑与样式对齐原系统 [`/compare`](http://0.0.0.0:18765/compare) 页面：每日定投 vs RSI 低于 20/25/30 触发买入，并额外提供 **资产走势图表**（定投 vs 可选 RSI 阈值 15/20/25/30）。

## 技术栈

- **Frontend**: Next.js 15 + Tailwind CSS + Recharts
- **Database**: Cloudflare D1（按需抓取 Yahoo Finance 并缓存）
- **Runtime**: Cloudflare Workers / Pages（Edge API Route）
- **Deploy**: Cloudflare Pages + GitHub 自动构建

## 本地开发

```bash
cd strategy-compare-cloud
npm install
```

**推荐：一键启动（端口 3002，改代码自动热更新）**

```bash
python3 start.py
```

或在 PyCharm 里直接运行根目录的 **`start.py`**。

等价命令：

```bash
npm run dev
```

打开 **http://127.0.0.1:3002** 。

- 前端 / API 路由保存后会由 Next.js 自动热更新，无需手动重启
- `start.py` 会在 dev 进程异常退出时自动重新拉起

本地 `next dev` 无 D1 绑定时会直接走 Yahoo Finance（不写库）。

## Cloudflare D1 配置

### 1. 创建数据库

```bash
npx wrangler d1 create strategy-compare-db
```

将输出中的 `database_id` 填入 `wrangler.toml` 的 `database_id` 字段。

### 2. 初始化表结构

`schema.sql` 定义了两张表：

| 表名 | 用途 |
|------|------|
| `daily_bars` | 缓存美股日线 OHLCV（主键 symbol + bar_date） |
| `fetch_log` | 可选，记录抓取元数据 |

```bash
# 本地 D1
npm run db:migrate:local

# 生产 D1
npm run db:migrate:remote
```

### 3. 绑定到 Pages 项目

在 Cloudflare Dashboard → Pages → 你的项目 → Settings → Functions → D1 bindings：

- Variable name: `DB`
- D1 database: `strategy-compare-db`

或在 `wrangler.toml` 中已配置 `binding = "DB"`。

## 按需抓取策略

```
用户查询 Ticker + 年数
    ↓
查 D1：该 symbol 在 [warmStart, end] 是否有足够日线
    ↓ 命中          ↓ 未命中
  直接返回      Yahoo Chart API 抓取 → 批量 UPSERT D1 → 返回
```

- **warmStart**：比用户区间起点再往前约 45 天，用于 RSI(6) 预热（与原系统一致）
- **批量写入**：每 100 行一批 `db.batch()`，降低 Edge CPU 耗时
- 免费 Workers CPU 限制 50ms：命中缓存时仅 SELECT；未命中时尽量单次 HTTP + 分批写入

## API

```
GET /api/bars?symbol=SPY&years=5
```

响应含 `rows`（K 线 + RSI）与 `compare`（策略表 + 图表序列）。

## 部署

```bash
npm run cf:build
npm run cf:deploy
```

或在 Cloudflare Pages 连接 GitHub 仓库，构建命令：

```bash
npm install && npx opennextjs-cloudflare build
```

输出目录按 OpenNext Cloudflare 文档配置。

## 目录结构

```
strategy-compare-cloud/
├── schema.sql              # D1 表结构（含中文注释）
├── wrangler.toml           # D1 / 环境变量
├── src/
│   ├── app/
│   │   ├── page.tsx        # 对比页
│   │   ├── globals.css     # 与原系统 theme 对齐
│   │   └── api/bars/       # Edge 抓取 + 计算 API
│   ├── components/         # 表单、表格、图表
│   └── lib/
│       ├── compare.ts      # 策略计算（同 compare.js）
│       ├── rsi.ts          # Wilder RSI(6)
│       ├── db.ts           # D1 读写
│       └── yahoo.ts        # Yahoo Finance 抓取
```

## 与原系统对应关系

| 原系统 | 本子项目 |
|--------|----------|
| `web/templates/compare.html` | `ComparePage.tsx` |
| `web/static/js/compare.js` | `lib/compare.ts` |
| `web/static/css/theme.css` | `tailwind.config.ts` + `globals.css` |
| `GET /api/bars` + SQLite | `GET /api/bars` + D1 |
| yfinance 回填 | Yahoo Chart API |

输入简化为 **Ticker + 年数**（与 Telegram 机器人 `SPY 2` 一致）。
