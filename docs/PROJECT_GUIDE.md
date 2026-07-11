# BlueChip — Complete Project Guide

This document explains the **entire project**: what it is, every technology we use and *why*, how data flows through the system, and what every file does. Read this top to bottom and you'll understand the whole codebase.

---

## 1. What is BlueChip?

BlueChip is a **crypto paper-trading platform**. In plain words:

- Anyone can create an account and receive **$100,000 of fake money**.
- They trade real cryptocurrencies (Bitcoin, Ethereum, Solana, …) at **real live prices** pulled from the **Gemini exchange's public API**.
- Orders, balances, holdings, and profit/loss are all tracked like a real exchange — but **no real money ever exists**. It's a simulator.

Think of it as: *the front half of a real exchange (live prices, charts, order types), with the back half (money and settlement) fully simulated in our own database.*

**Why paper trading?** Because it lets the site be public without any financial or legal risk, no per-user exchange accounts, and no API keys to protect — while still requiring us to build genuinely exchange-like machinery (order matching, atomic accounting, live market data).

---

## 2. The Big Picture — three apps

```
                                   ┌──────────────────────────┐
                                   │   Gemini exchange (public)│
                                   │  REST API + WebSocket     │
                                   └───────────┬──────────────┘
                                               │ live prices, candles
                                               ▼
┌──────────────┐   signup/login    ┌──────────────────────────┐      ┌──────────┐
│  frontend/   │ ────────────────► │        backend/           │ ◄──► │ MongoDB  │
│ landing site │                   │  Express API + simulated  │      │ users,   │
│  port 3000   │  redirect with    │  exchange engine          │      │ orders,  │
└──────────────┘  ?token=JWT       │  port 3002                │      │ holdings │
        │                          └───────────▲──────────────┘      └──────────┘
        ▼                                      │ prices, orders, portfolio
┌──────────────┐                               │
│  dashboard/  │ ──────────────────────────────┘
│ trading app  │
│  port 3001   │
└──────────────┘
```

| App | What it is | Port |
|---|---|---|
| `frontend/` | Marketing/landing site + signup & login forms | 3000 |
| `dashboard/` | The trading app users see after login | 3001 |
| `backend/` | REST API + the simulated exchange engine | 3002 |

They are three separate apps (a "monorepo") so each can be deployed independently: the two React apps become static sites (Netlify), the backend runs as a Node server (Render).

---

## 3. Tech Stack — what we use and WHY

### Backend
| Tech | Why we chose it |
|---|---|
| **Node.js + TypeScript** | One language (TypeScript) across the whole repo; types catch bugs at compile time — vital for money math. Node 18+ has built-in `fetch`, so calling Gemini's REST API needs no extra library. |
| **Express 5** | The standard, minimal web framework for Node. Routes + middleware are easy to read and test. |
| **MongoDB + Mongoose 9** | Document DB fits our shapes (a holding, an order) naturally. Crucially, MongoDB gives us **atomic conditional updates** — the trick that makes trading safe without locks (see §5). Mongoose adds schemas + types on top. |
| **JWT (`jsonwebtoken`) + bcrypt** | Stateless login: the server signs a token at login; every request proves identity by presenting it. bcrypt (cost 12) hashes passwords so a DB leak never exposes them. |
| **`ws`** | Raw WebSocket client used to subscribe to Gemini's live market-data stream. |
| **`express-rate-limit`** | The site is public; this stops brute-force login attempts and order spam. |
| **Jest + ts-jest + supertest** | Tests run the real Express app in-memory (supertest) with the database **mocked** — so 100+ tests run in ~2 seconds with no DB and no network. |

### Dashboard (trading app)
| Tech | Why |
|---|---|
| **React 19 + TypeScript (Create React App)** | Component model fits a live-updating trading UI; shared types in `src/types.ts` mirror the backend's schemas. |
| **Material UI** | Ready-made accessible components (tooltips, icons) so we focus on trading logic, not widget plumbing. |
| **Chart.js 4 + react-chartjs-2** | Battle-tested canvas charts (bar, doughnut). |
| **`chartjs-chart-financial` + `chartjs-adapter-date-fns`** | Adds the **candlestick** chart type to Chart.js — the classic trading chart — reusing the library we already ship instead of adding a second charting stack. |
| **axios + react-cookie + react-toastify** | HTTP client, auth-cookie handling, and non-blocking success/error notifications. |
| **react-router 7** | Client-side pages: Summary, Orders, Holdings, Leaderboard, Funds, Market detail. |

### Frontend (landing site)
React 19 + TypeScript + Bootstrap. Static marketing pages plus the signup/login forms that talk to the backend.

### Why Gemini (and not an API key per user)?
Gemini's **public** market-data API needs **no key and no account**: tickers, candles, and a streaming WebSocket are free to read. Trading APIs (any exchange) act on ONE account per key — they can't give thousands of anonymous visitors their own accounts. So: **prices come from Gemini, trades settle in our own MongoDB.** One backend feed serves every user, so Gemini's rate limits never scale with user count.

---

## 4. How data flows

### Prices (the heartbeat of the app)
1. `backend/services/geminiWs.ts` holds one WebSocket to Gemini. Every real trade on Gemini for our 8 symbols updates…
2. `backend/services/priceFeed.ts` — a single in-memory `Map` of `symbol → {price, changePct24h, updatedAt, source}`. A REST poller (every 30s) runs underneath as a fallback and supplies the 24h-change number (the WS doesn't carry it).
3. The dashboard's `PricesContext.tsx` polls `GET /api/prices` every 5s and hands prices to every component (watchlist, top bar, trade modal, charts) through React context.

*Why polling to the browser instead of a WebSocket?* Simplicity and free-tier friendliness. Reading an in-memory map costs microseconds; 5s latency is fine for paper trading; and upgrading later means changing exactly one file (`PricesContext.tsx`).

### An order, end to end
1. User clicks **Buy** in `BuySellModal.tsx` → `POST /api/orders {symbol, side, type, qty, limitPrice?}`.
2. `verifyToken` middleware identifies the user; `orderLimiter` rate-limits them.
3. `orderEngine.placeOrder()` validates (symbol whitelist, qty caps, **price freshness** — stale market data means a 503, never a bad fill).
4. **MARKET** order: fills instantly at the cached live price — debit cash, upsert holding, mark `FILLED` (or `REJECTED` with a reason).
   **LIMIT** order: stored with status `OPEN`.
5. `matcher.ts` wakes every 2 seconds, scans OPEN limit orders, and fills any the market has crossed — at the market price (*price-or-better*, like a real exchange).
6. After every fill, `snapshots.ts` records the user's total portfolio value — that's what draws the Summary chart.

---

## 5. The three hard problems (and how we solve them)

**1. Two requests racing for the same money.** A user double-clicks Buy with $100 left; both requests check "balance ≥ cost?" then both debit → negative balance. Classic race condition. Our fix: **conditional atomic updates** — check and debit happen as ONE database operation:
```js
UserModel.updateOne(
  { _id: userId, balance: { $gte: cost } },  // only matches if still affordable
  { $inc: { balance: -cost } }               // …and debits in the same operation
)
```
If `modifiedCount === 0`, the money was already gone → the order becomes `REJECTED "Insufficient funds"`. Same pattern guards sell quantities and order-status transitions (a cancel and a matcher fill can race — whoever flips `OPEN` first wins, atomically). No locks, no transactions, can't go negative.

**2. Floating-point money.** `0.1 + 0.2 === 0.30000000000000004` in JavaScript. Every dollar amount passes through `roundUsd()` (2 decimals) and every coin quantity through `roundQty()` (8 decimals) in `util/money.ts`; selling "everything" tolerates float dust via `QTY_EPSILON`, and near-zero leftover rows get deleted.

**3. A flaky external feed.** Gemini's WebSocket can die silently (half-open TCP). `geminiWs.ts` runs a **heartbeat watchdog** (no message for 30s → kill and reconnect), reconnects with **exponential backoff + jitter** (1s → 30s cap), and uses a **generation counter** so a zombie socket can never write stale prices over a fresh one. And because the REST poller never stops, trading survives WS outages.

---

## 6. File-by-file walkthrough

### `backend/` — the API + exchange engine

**Entry & config**
| File | What it does |
|---|---|
| `index.ts` | The Express app. Wires middleware (CORS, JSON body w/ 10kb cap, cookies, rate limits), mounts all routes, defines `/allHoldings`, `/api/account`, `/api/account/reset`, `/healthz`, runs the idempotent startup **migration** (backfills `balance` on old users, purges pre-pivot data), and on boot starts the four background services: WebSocket feed, REST poller, limit-order matcher, snapshot sweeper. Exports `app` without listening when imported — that's how tests drive it. |
| `config/symbols.ts` | The curated list of 8 tradable Gemini pairs (BTCUSD…AVAXUSD) with display names. Validated against Gemini's live symbol directory at boot so a delisted coin gets dropped instead of erroring forever. Kept small on purpose: 8 symbols keeps REST polling far under Gemini's ~120 req/min public limit. |
| `tsconfig.json`, `jest.config.js`, `package.json` | TypeScript build (`tsc` → `dist/`), ts-jest test setup, scripts (`start` dev via nodemon, `build`, `serve` for production). |
| `.env.example` | Documents every env var: `MONGO_URL`, `TOKEN_KEY`, `PORT`, `CORS_ORIGINS`, rate-limit overrides, optional Gemini sandbox URLs. |

**Schemas & models** (`schemas/` define shape, `model/` register them with Mongoose)
| File | Shape & purpose |
|---|---|
| `schemas/UserSchema.ts` | `{email, username, password, balance, createdAt}`. The pre-save hook bcrypt-hashes the password — **guarded by `isModified("password")`** so a later save can't re-hash the hash and lock the user out. `balance` defaults to $100,000. |
| `schemas/HoldingsSchema.ts` | `{userId, symbol, qty, avgCost}` — one row per user per coin (enforced by a unique compound index). `avgCost` is the weighted-average purchase price, used for P&L. |
| `schemas/OrdersSchema.ts` | `{userId, symbol, side: BUY/SELL, type: MARKET/LIMIT, status: OPEN/FILLED/CANCELLED/REJECTED, qty, limitPrice?, fillPrice?, reason?, createdAt, filledAt?}` — a full order lifecycle, indexed for the matcher (`status+type`) and the user's order list (`userId+createdAt`). |
| `schemas/SnapshotSchema.ts` | `{userId, value, cash, ts}` — a point-in-time portfolio value; powers the performance chart. |
| `model/UserModel.ts`, `HoldingsModel.ts`, `OrdersModel.ts`, `SnapshotModel.ts` | One-liners that register each schema as a Mongoose model. |

**Services — the interesting logic**
| File | What it does |
|---|---|
| `services/gemini.ts` | Thin typed wrappers over Gemini's public REST API: `fetchSymbols()`, `fetchTickerV2()` (price + 24h change), `fetchCandles()` (OHLCV history). Uses Node's built-in `fetch`. |
| `services/priceFeed.ts` | **The single shared price cache.** `startPolling()` refreshes every symbol on an interval; `setPrice()` lets the WebSocket inject fresher prices; `isFresh()` is the safety check the order engine uses (never fill on data older than 30s); errors on one symbol never break the loop. |
| `services/geminiWs.ts` | The Gemini v2 market-data WebSocket client: subscribes to all symbols, feeds trade prices into the cache tagged `source:"ws"`. Contains the watchdog / backoff / generation-counter reliability machinery from §5. |
| `services/orderEngine.ts` | **The core.** `placeOrder()` = validation + market-fill or limit-placement. `applyFillEffects()` = the atomic money movement: conditional debit, weighted-average holding upsert (done *inside MongoDB* via an aggregation-pipeline update so concurrent buys compute the average correctly; note Mongoose 9 requires `updatePipeline: true`), guarded sell decrement, dust cleanup, refund-on-failure. Shared by the market path and the matcher. |
| `services/matcher.ts` | The background limit-order matcher: every 2s, find OPEN limit orders, check `crossed()` (BUY fills when market ≤ limit; SELL when market ≥ limit), **claim the order atomically** (`OPEN→FILLED`), then apply portfolio effects; if funds vanished since placement → `REJECTED`. |
| `services/snapshots.ts` | `snapshotUser()` after each fill/signup/reset; `snapshotAll()` sweeps every user each 15 min so idle portfolios still chart as prices drift. |

**Routes, middleware, util**
| File | What it does |
|---|---|
| `routes/AuthRoute.ts` | `POST /signup`, `POST /login`, `POST /` (session check). |
| `routes/MarketRoute.ts` | Public, no auth: `/api/symbols`, `/api/prices`, `/api/candles/:symbol` (proxied + TTL-cached so a thousand chart viewers cost Gemini one request per minute). |
| `routes/OrderRoute.ts` | `POST /api/orders`, `GET /api/orders`, `POST /api/orders/:id/cancel` — all behind auth + per-user rate limit. |
| `routes/PortfolioRoute.ts` | `GET /api/leaderboard` (everyone ranked by cash + live holdings value; memoized 30s) and `GET /api/portfolio/history` (snapshots downsampled to ≤200 chart points). |
| `controllers/AuthController.ts` | Signup (validates, rejects duplicates, never echoes the hash, seeds the first snapshot) and Login (bcrypt compare, generic error message so attackers can't tell which field was wrong). |
| `middlewares/AuthMiddleware.ts` | `verifyToken` — the route guard. Accepts the JWT from cookie, `Authorization: Bearer`, or `?token=` (the dashboard runs on a different origin, so the fallbacks matter). Loads the user onto `req.user`. `userVerification` — the "am I logged in?" check. |
| `middlewares/rateLimit.ts` | Three limiters: auth (20/15min per IP), orders (30/min per **user**), global (300/min). Env-overridable. |
| `util/money.ts` | `roundUsd`, `roundQty`, `QTY_EPSILON`, `STARTING_CASH`, order-size caps, `weightedAvgCost` — the single home of all money math. |
| `util/SecretToken.ts` | Signs the 3-day JWT. |

**Tests** (`__tests__/`, 102 tests, no DB or network needed)
| File | Covers |
|---|---|
| `api.test.ts` | Auth contract: signup/login/session, per-user holdings scoping, `/api/account`. |
| `orders.test.ts` | The engine: validation matrix, exact debits, insufficient funds/qty → REJECTED, refund-on-failure, limit placement + soft affordability, cancel, epsilon sell-all. |
| `matcher.test.ts` | Crossing logic both directions, atomic claim (a lost race mutates nothing), fill-time rejection, error isolation. |
| `priceFeed.test.ts` | Cache population, per-symbol error isolation, WS-vs-REST precedence, staleness. |
| `geminiWs.test.ts` | WS message parsing (trades, snapshots, junk) and backoff math. |
| `market.test.ts` | Candle proxy: whitelists, ascending order, TTL cache, stale-cache-on-error. |
| `leaderboard.test.ts` / `snapshots.test.ts` | Ranking math + memoization; snapshot values + history downsampling. |
| `money.test.ts` / `userSchema.test.ts` | Rounding edge cases; the password re-hash guard; symbol validation. |
| `hardening.test.ts` | `/healthz`, 429 rate limiting, oversized-field and oversized-body rejection. |

### `dashboard/` — the trading app

| File | What it does |
|---|---|
| `src/config.ts` | `API_URL` and `LOGIN_URL` — the single place backend/login origins live (env-overridable for production). |
| `src/types.ts` | Shared TypeScript types mirroring the backend: `Holding`, `Order`, `Account`, `TickerPrice`, `SymbolInfo`, `Candle`. |
| `src/index.tsx`, `index.css`, `theme.ts` | App bootstrap; the design tokens (dark theme, red accent `#e50914`, gain/loss greens/reds) live in `index.css` `:root` and are mirrored into the MUI theme. |
| `components/Home.tsx` | The auth shell. Handles the cross-origin login handoff: landing site redirects here with `?token=JWT`, Home stores it as a cookie, scrubs the URL, verifies it with the backend, and wraps the app in `PricesProvider`. |
| `components/PricesContext.tsx` | **The live-price bloodstream**: polls `/api/prices` every 5s, exposes `{prices, symbols, isStale}` to every component via context. |
| `components/TopBar.tsx` | Paper-trading disclaimer banner, live BTC & ETH tickers, and the Live/Delayed pill (dims when data is stale; tooltip says when prices are streaming via WebSocket). |
| `components/Menu.tsx` | Nav: Dashboard / Orders / Holdings / Leaderboard / Funds / Apps. |
| `components/Dashboard.tsx` | The route table + layout (watchlist sidebar + content). Wraps everything in `GeneralContextProvider` so any page can open the trade modal. |
| `components/WatchList.tsx` | The always-visible sidebar: all 8 coins with live price, 24h %, sparkline; search filter; hover reveals Buy/Sell/Chart actions; doughnut chart compares 24h movement (not raw prices — BTC would dwarf every slice). |
| `components/Summary.tsx` | The home page: greeting, portfolio value / today's P&L / total return / buying power cards, and the **real** performance chart drawn from portfolio snapshots (1D/1W/1M/ALL). |
| `components/Orders.tsx` | Order history table: side & status chips (FILLED green, OPEN amber, REJECTED red with reason on hover), fill price, Cancel button on resting orders, 10s auto-refresh so matcher fills appear. |
| `components/Holdings.tsx` | Positions table with live prices, per-row and total P&L, and a value bar chart; polls quietly every 10s. |
| `components/Leaderboard.tsx` | Everyone ranked by live portfolio value; your rank highlighted; 🥇🥈🥉 for the podium. |
| `components/Funds.tsx` | Cash/portfolio/return cards, the paper-trading explainer, and the "Reset account" button (fresh $100k). |
| `components/MarketDetail.tsx` | `/market/:symbol` — live price header, timeframe tabs (15m/1H/6H/1D), the candlestick chart, Buy/Sell buttons. |
| `components/GeneralContext.tsx` | Tiny context that lets any component open/close the trade modal. |
| `components/shared/BuySellModal.tsx` | The order ticket: Buy/Sell tabs, **Market/Limit toggle**, live price that ticks while open, fractional quantities, estimated cost vs your cash, limit price prefilled from the live price, precise success/rejection toasts. |
| `components/shared/CandleChart.tsx` | The one place `chartjs-chart-financial` is registered — candlesticks in theme colors, dark grid, time axis. Isolated so a library swap touches one file. |
| `components/shared/DataTable.tsx` | Generic table with loading skeleton + empty states — used by Orders, Holdings, Leaderboard. |
| `components/shared/Sparkline.tsx` | Small SVG line for watchlist rows; exports `linePath()` which Summary reuses for the big portfolio chart. |
| `components/shared/PnLValue.tsx`, `StatCard.tsx`, `EmptyState.tsx`, `Skeleton.tsx` | Green/red signed numbers with arrows; stat cards; empty and loading states. |
| `components/DoughnoutChart.tsx`, `VerticalGraph.tsx` | Chart.js doughnut & bar wrappers. |
| `*.test.tsx` | Component tests (Holdings, Funds, PnLValue, EmptyState) with axios mocked. |
| `netlify.toml` | Build + SPA-redirect config for deployment (prepped, not deployed). |

### `frontend/` — the landing site

`src/landing_page/` contains the marketing pages — `home/` (Hero, Pricing, Stats, Education…), `about/`, `products/`, `pricing/`, `support/` — plus `Navbar`, `Footer`, `OpenAccount`, `NotFound`, and crucially **`signup/Signup.tsx` and `login/Login.tsx`**: they POST to the backend and on success redirect to the dashboard as `dashboard-url/?token=<JWT>` (the cross-origin handoff `Home.tsx` completes). `src/config.ts` holds `API_URL`/`DASHBOARD_URL`. *Note: this app's copy is still stock-broker themed — its crypto rebrand is the next planned piece of work.*

### Repo root
| File | Purpose |
|---|---|
| `README.md` | Quick start, feature list, API table, deployment guide. |
| `docs/PROJECT_GUIDE.md` | This file. |
| `CLAUDE.md` | Instructions for AI coding tools used on this repo. |

---

## 7. Glossary (for readers new to trading)

- **Paper trading** — trading with fake money at real prices; a simulator.
- **Market order** — "buy/sell NOW at whatever the price is." Fills instantly.
- **Limit order** — "buy only at $X or cheaper / sell only at $Y or higher." Rests in the book until the market crosses your price.
- **Price-or-better** — a limit order fills at the *market* price at fill time, which is by definition equal to or better than your limit.
- **Weighted average cost** — buy 1 BTC @ $60k then 1 @ $70k → your avg cost is $65k; profit is measured against that.
- **Slippage/staleness guard** — we refuse to fill orders when the price cache is older than 30s, so nobody trades on dead data.
- **P&L** — profit and loss. *Unrealized* = on paper (still holding); *realized* = locked in by selling.

---

## 8. Numbers at a glance

- **8** tradable pairs · **$100,000** starting balance · **2s** matcher tick · **5s** UI price refresh · **30s** REST fallback poll · **15min** portfolio snapshots
- **102** backend tests + **12** dashboard tests, all green; both apps compile with strict TypeScript
- **0** API keys, **0** real dollars, **1** shared Gemini feed no matter how many users
