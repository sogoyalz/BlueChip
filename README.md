# BlueChip — Crypto Trading Platform (Gemini Sandbox)

![CI](https://github.com/sogoyalz/BlueChip/actions/workflows/ci.yml/badge.svg)

A full-stack **crypto trading platform** built with the **MERN stack** (MongoDB, Express, React, Node.js). Anyone can sign up and trade Bitcoin, Ethereum, Solana and more — orders are placed for real against **Gemini's sandbox exchange** (real order matching, real fills, real order lifecycle) using a single shared sandbox account with test funds.

> No real money is ever deposited, withdrawn, or at risk — every order settles on Gemini's **sandbox** (`api.sandbox.gemini.com`), a separate test environment from Gemini's production exchange. "BlueChip" is a fictional brand, not affiliated with Gemini or any real broker. Every trader shares one sandbox account, so balances, holdings, and order history are shared across all users.

📖 **New here? Read [docs/PROJECT_GUIDE.md](docs/PROJECT_GUIDE.md)** — a complete walkthrough of every technology choice (and why), the architecture, and what every file in the repo does.

![BlueChip landing page](docs/screenshots/landing-home.png)

## 📸 See it in action

Placing a limit order and watching the matching engine fill it against the live market:

![Demo — limit order filled by the matcher](docs/screenshots/demo.gif)

| Trading dashboard | Real Gemini candles |
|---|---|
| ![Dashboard](docs/screenshots/dashboard-summary.png) | ![Candlestick chart](docs/screenshots/market-candles.png) |

---

## ✨ Features

- **Live Gemini market data** — one shared backend feed (WebSocket streaming + REST fallback, no API key needed) serves every user: live watchlist, tickers, and real OHLC candlestick charts
- **Streaming end to end** — prices flow Gemini WebSocket → backend cache → **Server-Sent Events** → browser, with automatic fallback to polling
- **Live order book depth** — real bids and asks maintained from Gemini's l2 feed, top-of-book with spread on every market page
- **Real order execution** — market orders place as immediate-or-cancel limit orders crossed through Gemini's sandbox book; limit orders rest as real resting orders on the exchange. HMAC-SHA384-signed private API calls, a background sync loop reconciles local order status against Gemini's
- **One shared sandbox account** — every signed-in user trades against the same Gemini sandbox account; balances, holdings, and order history are shared, not per-user
- **Portfolio history** — periodic + per-fill snapshots of the shared account's value power a real performance chart
- **Authentication** — signup & login with bcrypt-hashed passwords and JWT, gating who can place orders
- **Public-ready hardening** — rate limiting (auth, orders, global), body-size caps, `/healthz`, always-visible sandbox disclaimer

---

## 🏗️ Architecture

This is a monorepo with three independent applications:

```
BlueChip/
├── frontend/     # Landing site (React + CRA)           → http://localhost:3000
├── dashboard/    # Trading dashboard (React + MUI)      → http://localhost:3001
└── backend/      # REST API + exchange engine (Express) → http://localhost:3002
```

| App | Tech | Port |
|-----|------|------|
| **frontend** | React 19 + TypeScript, React Router, Bootstrap, Axios | 3000 |
| **dashboard** | React 19 + TypeScript, Material UI, Chart.js (+ financial charts), Axios | 3001 |
| **backend** | Express 5, Mongoose, JWT, bcrypt, ws (Gemini WebSocket) | 3002 |

**How prices flow:** the backend keeps one in-memory price cache. Gemini's public v2 market-data WebSocket streams trades into it (with heartbeat watchdog + exponential-backoff reconnect); a REST poller runs underneath as permanent fallback and supplies the 24h-change figure. The dashboard polls the cached prices — no user ever hits Gemini directly, so rate limits never scale with user count.

**How trades settle:** for real, on Gemini's **sandbox** exchange. Placing an order signs an HMAC-SHA384 request (`X-GEMINI-APIKEY` / `X-GEMINI-PAYLOAD` / `X-GEMINI-SIGNATURE`) against `api.sandbox.gemini.com` using one shared API key for the whole app. MARKET orders are emulated as `immediate-or-cancel` limit orders priced to cross the book; LIMIT orders rest as real resting orders. A background sync loop (`services/orderSync.ts`) polls Gemini's order status every ~5s and reconciles local MongoDB order records (`OPEN` → `FILLED` / `PARTIALLY_FILLED` / `CANCELLED`) — Gemini itself is the source of truth for fills, matching, and balances. The backend refuses to boot if the private API base URL isn't pointed at the sandbox.

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) v18+ (global `fetch` is used for Gemini REST calls)
- A [MongoDB](https://www.mongodb.com/atlas) database (Atlas or local)

### 1. Clone the repo
```bash
git clone https://github.com/sogoyalz/BlueChip.git
cd BlueChip
```

### 2. Set up the backend
```bash
cd backend
npm install
cp .env.example .env      # then fill in your real values (see below)
npm start                 # starts on http://localhost:3002
```

### 3. Set up the frontend (landing site)
```bash
cd frontend
npm install
npm start                 # starts on http://localhost:3000
```

### 4. Set up the dashboard
```bash
cd dashboard
npm install
npm start                 # starts on http://localhost:3001
```

> Run each in its own terminal tab. Start the backend first so the dashboard gets prices and data.

---

## 🔑 Environment Variables

Each app uses a `.env` file (never committed — see `.env.example` for the template).

**`backend/.env`**
```env
MONGO_URL=your_mongodb_connection_string
TOKEN_KEY=your_jwt_secret
PORT=3002
NODE_ENV=production
# Production only: comma-separated allowed browser origins
# CORS_ORIGINS=https://your-landing.netlify.app,https://your-dashboard.netlify.app
#
# NOTE: the auth cookie is sameSite:"lax", which requires the backend and
# both frontends to share ONE registrable domain (e.g. api./app./www.yoursite.com).
# If you deploy to the default *.onrender.com / *.netlify.app domains instead,
# the cookie won't be sent cross-site and login will silently fail. Either set
# up custom subdomains on one domain, or change sameSite to "none" in
# backend/controllers/AuthController.ts before deploying.

# Gemini SANDBOX trading credentials — register at
# https://exchange.sandbox.gemini.com/ and create an API key with Trading
# permission. One shared key for the whole app.
GEMINI_API_KEY=your_sandbox_api_key
GEMINI_API_SECRET=your_sandbox_api_secret
# Must stay pointed at the sandbox — the app refuses to boot otherwise.
# Defaults to https://api.sandbox.gemini.com if unset.
# GEMINI_PRIVATE_API_URL=
```

**`frontend/.env`**
```env
PORT=3000
# Optional — override backend origins for deployed environments:
# REACT_APP_API_URL=https://your-backend.example.com
# REACT_APP_DASHBOARD_URL=https://your-dashboard.example.com
```

**`dashboard/.env`**
```env
PORT=3001
# Optional — override backend/login origins for deployed environments:
# REACT_APP_API_URL=https://your-backend.example.com
# REACT_APP_LOGIN_URL=https://your-landing.example.com/login
```

---

## 📡 API Endpoints

Base URL: `http://localhost:3002`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/signup` | — | Register (seeds $100k simulated cash) |
| `POST` | `/login` | — | Log in and receive a JWT |
| `POST` | `/` | — | Verify the current auth token |
| `GET` | `/healthz` | — | Health: WebSocket + price freshness |
| `GET` | `/api/symbols` | — | Supported Gemini pairs |
| `GET` | `/api/prices` | — | Live price cache (all symbols) |
| `GET` | `/api/stream` | — | Live prices over Server-Sent Events |
| `GET` | `/api/book/:symbol` | — | Top 10 bids/asks from the live order book |
| `GET` | `/api/candles/:symbol?timeframe=1hr` | — | OHLCV history (cached proxy) |
| `GET` | `/api/holdings` | ✅ | The shared account's holdings, enriched with live prices |
| `GET` | `/api/account` | ✅ | Shared cash balance + portfolio value |
| `POST` | `/api/orders` | ✅ | Place a MARKET or LIMIT order (real Gemini sandbox order) |
| `GET` | `/api/orders` | ✅ | Your orders (`?status=open` for resting) |
| `POST` | `/api/orders/:id/cancel` | ✅ | Cancel a resting order (cancels on Gemini first) |
| `GET` | `/api/portfolio/history?range=1W` | ✅ | Shared portfolio value snapshots |

✅ = requires a valid JWT (cookie, `Authorization: Bearer`, or `?token=`).

**Place an order:**
```json
POST /api/orders
{ "symbol": "BTCUSD", "side": "BUY", "type": "LIMIT", "qty": 0.05, "limitPrice": 64000 }
```

---

## 🧪 Testing

```bash
cd backend && npx jest      # engine, order sync, feeds, routes (100+ tests, no DB needed)
cd dashboard && npm test    # dashboard component tests
cd frontend && npm test     # landing-site component tests
```

Backend tests mock Mongoose models, the price feed, and the Gemini sandbox client, so they run fast and offline — including order-placement edge cases (IOC rejects/partial fills, cancel-vs-fill races) against a mocked Gemini response, not a real sandbox call.

---

## ☁️ Deploying (when you're ready)

The repo is deploy-ready but nothing is deployed by default.

1. **MongoDB Atlas** — create a free M0 cluster, get the connection string.
2. **Backend → Render** (free tier): root directory `backend`, build `npm install && npm run build`, start `npm run serve`. Env: `MONGO_URL`, `TOKEN_KEY`, `CORS_ORIGINS` (both Netlify URLs).
3. **Frontends → Netlify** (two sites): `frontend/netlify.toml` and `dashboard/netlify.toml` are already in place. Set the `REACT_APP_*` env vars per site (they're baked at build time).
4. **Keep-alive**: point a free uptime pinger (UptimeRobot / cron-job.org) at `GET /healthz` every ~10 min — on Render's free tier the server sleeps when idle, which pauses order syncing and snapshots.

---

## 📂 Project Structure

```
backend/
├── config/         # curated Gemini symbol list
├── controllers/    # request handlers (auth)
├── middlewares/    # JWT verification, rate limits
├── model/          # Mongoose models
├── schemas/        # Mongoose schemas (User, Order, Snapshot)
├── routes/         # auth, market data, orders, portfolio
├── services/       # the interesting bits:
│   ├── gemini.ts        # public Gemini REST wrappers (market data)
│   ├── geminiWs.ts      # WebSocket feed (watchdog + backoff reconnect)
│   ├── geminiPrivate.ts # HMAC-signed Gemini sandbox trading client
│   ├── priceFeed.ts     # shared in-memory price cache
│   ├── orderEngine.ts   # validation + real order placement/cancel
│   ├── orderSync.ts     # reconciles local order status against Gemini
│   └── snapshots.ts     # shared portfolio history
├── util/           # money rounding
└── index.ts        # app entry point

frontend/src/landing_page/
├── home/  about/  products/  pricing/  support/
├── login/  signup/
└── Navbar.tsx  Footer.tsx  ...

dashboard/src/components/
├── Dashboard.tsx  Holdings.tsx  Orders.tsx
├── Funds.tsx  WatchList.tsx  Summary.tsx  MarketDetail.tsx
├── PricesContext.tsx  (shared live-price poll)
└── shared/  (BuySellModal, CandleChart, DataTable, ...)
```

---

## 📝 License

This project is for educational purposes. Not for commercial use.
