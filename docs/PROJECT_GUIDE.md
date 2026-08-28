# BlueChip — Project Guide

What this system is, how it actually works, and what every file does. This
document describes the code as it exists. Where something is a known gap it is
labelled as one; nothing here is aspirational.

---

## 1. What BlueChip is

A crypto trading platform whose orders **execute for real against Gemini's
sandbox exchange**.

This is the part that surprises people, so it is worth being precise:

- Prices are real, streamed live from Gemini.
- Orders are placed on a real matching engine, rest in a real book, and fill —
  or partially fill, or don't fill — according to real market movement.
- The funds are test funds on a Gemini **sandbox** account. No real money can
  be deposited, withdrawn, or lost.

It is **not** a simulator with a fake matching engine. There is no local order
matcher, no per-user cash ledger, and no synthetic fills. Gemini is the source
of truth for every order's state, and this backend's job is to place orders,
reconcile their status, and present the account.

### The shared-account model

There is **one** Gemini sandbox account, and every signed-in user trades
against it. Balances and holdings are properties of that single account, so
every user sees the same ones. Orders are attributed per user in MongoDB (a
user only ever sees their own), but the money behind them is shared.

This is deliberate. A trading API key acts on exactly one account, so giving
each visitor their own real sandbox account is not possible. The alternative —
simulating per-user balances — is what this project moved *away* from, because
it meant writing a fake matching engine and calling the fills real.

The consequence to keep in mind while working on this codebase: **two users
acting at once are acting on the same money.** Concurrency bugs that would be
per-user annoyances in a normal design are account-wide here.

---

## 2. Three apps

```
                    Gemini (public market data)          Gemini (private, sandbox)
                    REST ticker + candles                 authenticated, HMAC-signed
                    v2 WebSocket (trades + l2 book)       order placement / status / balances
                              │                                        ▲
                              ▼                                        │
┌──────────────┐      ┌───────────────────────────────────────────────────────┐      ┌──────────┐
│  frontend/   │      │                       backend/                        │      │ MongoDB  │
│ landing site │─────▶│  shared price cache · order engine · reconciler · SSE │◀────▶│  users   │
│  :3000       │ auth │                        :3002                          │      │  orders  │
└──────────────┘      └───────────────────────────────────────────────────────┘      │ snapshots│
        │                          ▲                    │                            └──────────┘
        │ cookie                   │ REST + SSE         │
        ▼                          │                    ▼
┌──────────────┐                   │            price stream to browsers
│  dashboard/  │───────────────────┘
│ trading app  │
│  :3001       │
└──────────────┘
```

| App | What it is | Port |
|---|---|---|
| `backend/` | Express API. JSON + SSE only — it never serves HTML | 3002 |
| `dashboard/` | The trading app: watchlist, orders, holdings, charts | 3001 |
| `frontend/` | Marketing site plus the signup and login forms | 3000 |

Separate apps so each deploys independently: the two React apps build to static
sites (Netlify), the backend runs as a Node service (Render).

**Auth crosses app boundaries via a cookie.** The landing site posts credentials
to the backend, which sets an httpOnly cookie; the dashboard then loads already
authenticated. There is no token in the URL and no token in a request body —
both leak into logs, history, and referrer headers. The cookie is
`sameSite: "lax"`, which requires all three services to share one registrable
domain in production (`www.` / `app.` / `api.`). Deploying them on unrelated
domains breaks login silently — see §7.

---

## 3. Tech stack, and why

### Backend
| Tech | Why |
|---|---|
| Node + TypeScript | One language across the repo; types matter most around money and order state. Node's built-in `fetch` covers Gemini's REST API with no HTTP library. |
| Express 5 | Minimal, well-understood. Express 5 forwards async handler rejections to the error handler on its own. |
| MongoDB + Mongoose 9 | Document shapes fit orders and snapshots. Mongoose adds schema validation, typing, and `sanitizeFilter` for injection defence. |
| `jsonwebtoken` + `bcrypt` | Stateless sessions with a server-side revocation escape hatch (§5). bcrypt cost 12. |
| `ws` | Gemini's v2 market-data WebSocket. |
| `express-rate-limit` | Public surface: brute-force and order-spam limits. |
| `helmet` | Security headers. CSP is off — this API never serves HTML, and a CSP would only risk breaking the SSE stream. |
| Jest + ts-jest + supertest | Tests drive the real Express app in-process with models and the Gemini client mocked, so the suite needs no database and no network. |

### Dashboard
React 19 + TypeScript (Create React App), Material UI for tooltips/icons,
Chart.js 4 with `chartjs-chart-financial` for candlesticks, axios,
react-toastify, react-router 7.

### Frontend
React 19 + TypeScript (CRA) + Bootstrap.

> **Known constraint:** both React apps are on `react-scripts`, which is
> unmaintained. They carry build-toolchain audit findings that cannot be
> resolved without migrating off CRA. Nothing ships to the browser from those
> packages, but the exposure is real and is tracked separately.

---

## 4. How data flows

### Prices

1. **`services/geminiWs.ts`** holds one WebSocket to Gemini's v2 market-data
   feed, subscribed to all curated symbols. Trade events set the price; `l2`
   changes feed the order book. The first `l2_updates` after subscribing is a
   full snapshot, which resets the book so stale levels can't survive a
   reconnect.
2. **`services/priceFeed.ts`** is the single shared cache: `symbol → {price,
   changePct24h, updatedAt, source}`. A REST poller runs underneath every 30s
   as a permanent fallback and is the **only** source of the 24h-change figure,
   which the WebSocket does not carry. The poller will not overwrite a
   WebSocket price newer than 5s.
3. **`services/sse.ts`** broadcasts the whole cache to connected browsers every
   2s over Server-Sent Events, with a keep-alive comment every 25s and a
   per-IP stream cap.
4. **`PricesContext.tsx`** in the dashboard subscribes to `GET /api/stream` and
   falls back to polling `GET /api/prices` if the stream cannot connect. A
   clock-based check marks prices stale if nothing has arrived in 15s,
   regardless of transport — EventSource retries silently, so without that
   check a wedged backend would show frozen prices labelled "Live".

No user request ever reaches Gemini directly. One feed serves every visitor, so
Gemini's rate limits do not scale with user count.

### An order, end to end

1. `BuySellModal.tsx` → `POST /api/orders {symbol, side, type, qty, limitPrice?,
   clientOrderId?}`.
2. `verifyToken` identifies the user; `orderLimiter` caps them at 30/min.
3. `orderEngine.placeOrder()` validates: symbol allowlist, `qty > 0` and under
   the size cap, notional under the cap, `limitPrice` present and plausible for
   LIMIT orders, and **price freshness** — market data older than 30s is a 503,
   never a bad fill.
4. If a `clientOrderId` was supplied and an order already exists for it, that
   order is returned and nothing is placed. This is what makes a retry safe.
5. The order goes to Gemini. A **MARKET order is emulated as an
   immediate-or-cancel limit priced to cross the book** (a BUY bids 1% above,
   a SELL offers 1% below). Gemini has no plain market type for this flow.
6. The response determines the recorded status: nothing executed → `REJECTED`
   for MARKET (IOC, so the remainder is gone) or `OPEN` for LIMIT; fully
   executed → `FILLED`; partly executed → `PARTIALLY_FILLED` for MARKET or
   `OPEN` for a LIMIT that still rests. `filledQty` records what actually
   executed, which is not always `qty`.
7. If anything executed, the balances cache is invalidated and a portfolio
   snapshot is taken.
8. **`services/orderSync.ts`** reconciles afterwards. Every 5s it loads locally
   resting orders, fetches Gemini's active-order list in **one** call, and
   updates from it. Only orders that have *left* the book need an individual
   status lookup, and those are capped per tick. Status changes and new
   executions are written back; a new execution invalidates balances and
   snapshots.

### Cancelling

`POST /api/orders/:id/cancel` cancels on Gemini **first**, then reconciles local
state to whatever Gemini reports. An order can fill in the moment before a
cancel lands, and the route returns that outcome truthfully rather than
reporting a cancel that did not happen.

---

## 5. Correctness model

### Money

Gemini owns the ledger. This backend never mutates a balance.

Where it *aggregates* money — portfolio value, cash, snapshots — it works in
**integer cents**, because summing many float dollar amounts drifts sub-cent.
Each holding is converted to cents individually and the totals are summed as
integers; `fromCents()` converts back at the API edge only. Snapshots persist
`valueCents` / `cashCents`.

Order *prices* stay decimal (`limitPrice`, `fillPrice`). They mirror Gemini's
own decimal price model, and Gemini — not this app — is the ledger for them.

`util/money.ts` holds `roundUsd` (2dp), `roundQty` (8dp), `toCents`,
`fromCents`, `QTY_EPSILON`, and the order size caps.

### Auth

- JWT in an httpOnly cookie, or an `Authorization: Bearer` header. **Nowhere
  else** — `extractToken` in `AuthMiddleware.ts` is the single intake point,
  and it deliberately refuses the query string and the request body.
- HS256 pinned on both the signing and verifying side.
- `tokenVersion` on the user is compared against the token's `tv` claim on
  every request. **Logout increments it**, which is what makes logout an actual
  revocation rather than a request that the browser forget a cookie. It signs
  the user out everywhere; for an account that can place orders that is the
  safer default.
- Login runs a bcrypt comparison even when the email does not exist, against a
  dummy hash generated at the same `BCRYPT_COST`. Without it, "no such user"
  returns at database speed while a wrong password costs a full verify, and
  that gap alone enumerates registered addresses.
- CSRF: every state-changing request must carry `X-Requested-With:
  XMLHttpRequest`, a header only same-origin or CORS-permitted JavaScript can
  set. Layered with the `sameSite: "lax"` cookie.
- `mongoose.set("sanitizeFilter", true)` globally strips `$`-operators from
  query filters; the two places that legitimately need one wrap it in
  `mongoose.trusted()`.

### The external feed

Gemini's WebSocket can die silently (half-open TCP). `geminiWs.ts` runs a
watchdog (no message for 30s → terminate and reconnect), reconnects with
exponential backoff and jitter (1s → 30s cap), and carries a **generation
counter** so a zombie socket's handlers can never write over a live one. The
REST poller never stops, so prices survive a WebSocket outage.

### Concurrency — and a known gap

The shared account raises the stakes on concurrent writes.

Handled: the `(userId, clientOrderId)` unique **partial** index makes duplicate
submissions safe; if two requests race past the pre-insert check, the loser's
`E11000` is turned into "return the order the winner persisted", and Gemini
dedupes on the same key so the exchange cannot double-fill. The balances cache
carries a generation counter so a fetch already in flight when a fill
invalidates the cache cannot republish its pre-fill data.

The cancel route and `orderSync` both write order state, and they can run at
the same instant. Neither takes a lock. Instead, both go through one
conditional atomic update in `services/orderState.ts`, keyed on the single
thing that is monotonic: **an order's executed amount on the exchange only ever
increases**, so it doubles as a version number. The observation reporting more
executed is the more recent truth, whichever write happens to land second, and
the two orderings converge on the same state.

This replaced a genuine last-write-wins bug. Both writers used to read the
document, mutate it and `save()`; mongoose's default versioning only guards
array paths, so a cancel carrying older knowledge could overwrite a fill the
reconciler had just recorded — and because `CANCELLED` is terminal, the
reconciler would never revisit the order, making the divergence permanent.

---

## 6. File by file

### `backend/`

**Entry and config**

| File | What it does |
|---|---|
| `index.ts` | Wiring and boot only (~170 lines). Builds the Express app: helmet, CORS (origins trimmed — a stray space would silently match nothing), 10kb JSON cap, cookies, rate limits, CSRF on unsafe methods. Mounts the routes, defines `GET /api/holdings`, `GET /api/account`, `GET /healthz`. On boot: validates symbols against Gemini, starts the WebSocket, REST poller, order reconciler, snapshot sweeper and SSE broadcaster. Exports `app` without listening when imported, which is how tests drive it. |
| `migrations.ts` | The gated one-shot migration (§7), split out of index.ts. |
| `lifecycle.ts` | SIGTERM/SIGINT draining, split out of index.ts. |
| `config/symbols.ts` | The eight curated Gemini pairs and helpers. Cross-checked against Gemini's live symbol directory at boot so a delisted pair is dropped rather than polled forever; a network failure leaves the list untouched. |
| `.env.example` | Every environment variable, documented. Mirrored in §8. |

**Schemas and models**

| File | Shape |
|---|---|
| `schemas/UserSchema.ts` | `{email, username, password, createdAt, tokenVersion}`. Email is lowercased and trimmed with a unique index. The pre-save hook bcrypt-hashes at `BCRYPT_COST`, guarded by `isModified("password")` so a later save cannot hash the hash. **There is no `balance` field** — balances live on the Gemini account. |
| `schemas/OrdersSchema.ts` | `{userId, symbol, side, type, status, qty, filledQty?, limitPrice?, fillPrice?, geminiOrderId?, clientOrderId?, reason?, createdAt, filledAt?}`. Indexes for the reconciler (`status+type`), the user's list (`userId+createdAt`), and idempotency. |
| `schemas/SnapshotSchema.ts` | `{valueCents, cashCents, ts}` — the shared account's value over time, in integer cents. Not per user. |
| `model/*.ts` | One-line model registrations. |

**Services**

| File | What it does |
|---|---|
| `services/gemini.ts` | Typed wrappers over Gemini's **public** REST API: `fetchSymbols`, `fetchTickerV2`, `fetchCandles`. No credentials. |
| `services/geminiPrivate.ts` | The **signed** sandbox client: HMAC-SHA384 over a base64 payload, strictly increasing nonce. Refuses to load if its base URL is not a sandbox host. Exposes order placement, cancel, status, active orders, and balances — the last cached briefly with concurrent callers coalesced onto one request. |
| `services/priceFeed.ts` | The shared price cache and REST poller. `isFresh()` is the guard the order engine uses. |
| `services/geminiWs.ts` | The market-data WebSocket, with the watchdog, backoff and generation counter from §5. |
| `services/orderBook.ts` | Per-symbol bid/ask levels built from the `l2` feed; a change with quantity 0 removes a level. Serves top-N depth, best price first. |
| `services/orderEngine.ts` | Validation, MARKET-as-IOC pricing, idempotency, placement, persistence, and the cancel helper. Also the orphaned-fill path: if the local write fails after the order is already live on the exchange, it logs the exchange's order id and still invalidates balances, because the trade happened regardless. |
| `services/orderSync.ts` | The reconciler described in §4. |
| `services/account.ts` | Holdings and account totals over the shared sandbox account, in integer cents. Lifted out of the route handlers so the money aggregation is testable without HTTP. |
| `services/orderState.ts` | The one place order state is written. Applies an exchange observation conditionally and atomically, so a stale writer cannot overwrite a newer one (§5). |
| `services/snapshots.ts` | Portfolio value in integer cents, on a 15-minute sweep and after every fill. |
| `services/sse.ts` | The SSE broadcaster: client registry, per-IP cap, price frames, keep-alives. |

**Routes, middleware, util**

| File | What it does |
|---|---|
| `routes/AuthRoute.ts` | `POST /signup`, `/login`, `/logout`, and `POST /` (session check). |
| `routes/MarketRoute.ts` | Public: `/api/symbols`, `/api/prices`, `/api/stream`, `/api/book/:symbol`, `/api/candles/:symbol` (TTL-cached, serves stale data rather than an error if Gemini fails). |
| `routes/OrderRoute.ts` | `POST /api/orders`, `GET /api/orders`, `POST /api/orders/:id/cancel`. Auth + per-user rate limit. |
| `routes/AccountRoute.ts` | `GET /api/holdings`, `GET /api/account`. Auth. |
| `routes/PortfolioRoute.ts` | `GET /api/portfolio/history` — snapshots downsampled to ≤200 points, cents converted to dollars at the edge. |
| `controllers/AuthController.ts` | Signup, login, logout. Cookie options, the timing-equalised comparison, and the revocation bump. |
| `middlewares/AuthMiddleware.ts` | `extractToken`, `verifyToken` (route guard), `userVerification` (session check). |
| `middlewares/csrf.ts` | The custom-header requirement. |
| `middlewares/rateLimit.ts` | auth (20/15min per IP), orders (30/min per user), market (60/min per IP), global (300/min per IP). All env-overridable. |
| `util/money.ts` | All money and quantity maths. |
| `util/SecretToken.ts` | Signs the 12-hour JWT with the `tv` claim. |

**Tests** — `__tests__/`, **216** tests. Most run with the models mocked, so
they need no database and no network and finish in about three seconds.

`persistence.integration.test.ts` and `orderJourney.integration.test.ts` are the
exceptions and run a real MongoDB via
`mongodb-memory-server`. It exists because mocked suites are structurally blind
to anything that is a property of the driver or the server rather than of our
own logic — three separate bugs here reached a fully passing suite that way (a
`sparse` compound index that rejected a user's second keyless order, a
migration whose `$unset` mongoose silently emptied, and a conditional write
whose filter threw a `CastError` and never executed). It covers the index
constraints, the conditional order write including concurrent writers, and what
the database does with non-finite money.

`api.test.ts` (auth contract, revocation, token sources, CSRF, enumeration) ·
`orders.test.ts` (validation matrix, market/limit placement, idempotency and
its race, cancel, persist-failure handling) · `orderSync.test.ts`
(reconciliation, active-order batching, lookup cap, balance invalidation) ·
`geminiPrivate.test.ts` (signing, nonce, sandbox guard, balances cache races) ·
`priceFeed.test.ts` · `geminiWs.test.ts` · `orderBook.test.ts` ·
`market.test.ts` · `sse.test.ts` · `snapshots.test.ts` · `money.test.ts` ·
`userSchema.test.ts` · `hardening.test.ts`.

### `dashboard/` — **43** tests

| File | What it does |
|---|---|
| `config.ts` | `API_URL`, `LOGIN_URL`, and the axios default that sets the CSRF header on every request. |
| `types.ts` | Types mirroring the backend schemas. |
| `index.tsx`, `index.css`, `theme.ts` | Bootstrap and design tokens (dark, red accent, gain/loss colours), mirrored into the MUI theme. |
| `components/Home.tsx` | Auth shell: asks the backend whether the cookie is still valid, redirects to login if not, and wraps the app in `PricesProvider`. |
| `components/PricesContext.tsx` | The live-price feed: SSE with polling fallback and the staleness clock. Exposes `{prices, symbols, isStale}`. |
| `components/TopBar.tsx` | Paper-trading banner, BTC/ETH tickers, Live/Delayed pill. |
| `components/Menu.tsx` | Nav (Dashboard / Orders / Holdings / Funds), account menu, logout. The account control is a real `<button>` so it is keyboard-reachable — logout is the revocation path. |
| `components/Dashboard.tsx` | Routes and layout; wraps everything in `GeneralContextProvider` so any page can open the trade modal. |
| `components/WatchList.tsx` | The sidebar: eight coins with live price and 24h change, search, hover Buy/Sell/Chart actions, and a doughnut comparing 24h movement (not raw prices — BTC would dwarf every slice). |
| `components/Summary.tsx` | Home: greeting, portfolio value / today's P&L / buying power, and the portfolio chart from real snapshots. Renders "—" rather than "$0.00" for figures it does not have, and draws no chart when there is nothing honest to plot. |
| `components/Orders.tsx` | Order history. Quantity and price columns key off what actually executed rather than the status label, so a partial fill shows under `PARTIALLY_FILLED`, under a `CANCELLED` order that filled first, and under a resting order that partly crossed. |
| `components/Holdings.tsx` | Positions and a value bar chart; quiet 10s refresh. Distinguishes "no positions" from "we could not load", both ways. |
| `components/Funds.tsx` | Cash and portfolio value, and the shared-account explainer. |
| `components/MarketDetail.tsx` | `/market/:symbol` — price header, timeframe tabs, candlestick chart, live depth, Buy/Sell. |
| `components/GeneralContext.tsx` | Opens and closes the trade modal from anywhere. |
| `components/shared/BuySellModal.tsx` | The order ticket: Buy/Sell, Market/Limit, live price, estimated cost, and an idempotency key that is reused across a retry but cleared the moment any order parameter changes. |
| `components/shared/CandleChart.tsx` | The one place `chartjs-chart-financial` is registered. |
| `components/shared/DepthPanel.tsx` | Top-of-book depth with quantity bars and the spread; hidden when the book is empty. |
| `components/shared/DataTable.tsx` | Generic table with loading and empty states. |
| `components/shared/chartPath.ts` | `linePath()` — values to an SVG path. |
| `components/shared/PnLValue.tsx`, `StatCard.tsx`, `EmptyState.tsx`, `Skeleton.tsx` | Signed coloured numbers, stat cards, empty and loading states. |
| `components/DoughnoutChart.tsx`, `VerticalGraph.tsx` | Chart.js wrappers. |

### `frontend/` — **16** tests

`src/landing_page/` holds the marketing pages (`home/`, `about/`, `products/`,
`pricing/`, `support/`) plus `Navbar`, `Footer`, `NotFound`, `Reveal`
(scroll-in animation), `LiveTicker` (real prices from `/api/prices`), and the
`signup/` and `login/` forms. Those post to the backend and, on success,
redirect to the dashboard — the auth cookie is already set, so nothing is
passed in the URL. `src/config.ts` holds `API_URL`, `DASHBOARD_URL`, and the
CSRF axios default.

---

## 7. Deployment and the migration

`render.yaml` deploys the backend as a Render web service (build `npm install &&
npm run build`, start `npm run serve`, health check `/healthz`). The two React
apps build to static sites.

**Shutdown.** The process handles `SIGTERM`/`SIGINT`: background timers stop
first so no new work begins, the HTTP server drains what is already running,
then the database connection closes, with a 10-second cap so a deploy is never
held open. SSE streams are ended explicitly — they are held open indefinitely
by design, and an HTTP server will not finish closing while any remain.

**Domain requirement.** The auth cookie is `sameSite: "lax"`. All three
services must sit under one registrable domain (`www.` / `app.` / `api.`) or
the cookie will not be sent and login fails silently with 401s. The alternative
is `sameSite: "none"` with `secure: true`, which widens CSRF exposure.

### The migration

`migrate()` in `index.ts` runs only when `RUN_MIGRATIONS=true`, because the
free-tier host restarts constantly and the migration drops collections. It:

1. `$unset`s the removed `balance` / `realizedPnl` fields, **through the raw
   driver collection**. Through a mongoose Model this silently does nothing:
   `strict` mode strips paths that are not in the schema from update
   operators, and those fields were removed from the schemas in the pivot —
   which is precisely why they are being unset. The update becomes empty, no
   error is raised, and `modifiedCount` comes back `undefined`.
2. Drops the legacy `userId_1_clientOrderId_1` index **only if it is actually
   the legacy one**, so re-running never destroys a healthy index.
3. Builds the schema's indexes explicitly and awaits them, rather than letting
   mongoose's background `autoIndex` race the drop. If that race is lost, the
   `createIndex` fails with `IndexOptionsConflict` — reported on an `index`
   event nothing listens to — and the drop then leaves the collection with
   **no uniqueness constraint at all**, silently.
4. Verifies the partial index is in place afterwards and logs a loud error if
   it is not.
5. Drops legacy pre-pivot collections that still exist.

It is idempotent and safe to run against a live database with resting orders:
every step is conditional on current state, and nothing it touches overlaps
the fields `orderSync` or the cancel route write.

> A deploy that skips `RUN_MIGRATIONS=true` **looks successful and is not** —
> the app boots normally on the old, broken index.

### Deploy sequence for the index migration

Run this once. It is the only deploy that needs the flag.

**1 — Migrate.** Set `RUN_MIGRATIONS=true` in the service environment and
deploy. Expect exactly this in the boot log:

```
migrate: cleared legacy fields from N user(s) and N order(s)
migrate: dropped legacy sparse clientOrderId index
migrate: clientOrderId partial index verified
app started on port ...
```

If `migrate: FAILED` appears, stop. Do not clear the flag and do not take
traffic — order idempotency is not in force.

**2 — Verify the index independently.** Do not rely on the log alone:

```js
db.orders.getIndexes().find(i => i.name === "userId_1_clientOrderId_1")
```

It must show `unique: true` **and** `partialFilterExpression: { clientOrderId:
{ $type: "string" } }`. If it shows `sparse: true`, the migration did not run.
If it is missing entirely, the collection has no idempotency constraint —
rebuild it before serving traffic.

**3 — Confirm the behaviour** (optional, on a staging database only — it
writes rows):

```js
// two orders with no clientOrderId must both insert
// two orders with the SAME clientOrderId must reject the second
```

**4 — Clear the flag.** Unset `RUN_MIGRATIONS` and redeploy, so a restart
cannot re-run a destructive migration unattended.

**Known window:** between the drop and the rebuild there is a sub-second gap
with no uniqueness constraint. The migrating instance is not serving yet
(`migrate()` runs before `app.listen`), so it only matters if another instance
is live during a rolling deploy. Even then the exposure is a duplicate row,
not a double trade — Gemini dedupes on `client_order_id` independently.

---

## 8. Environment variables

Required:

| Var | Purpose |
|---|---|
| `MONGO_URL` | MongoDB connection string |
| `TOKEN_KEY` | JWT signing secret. The app refuses to boot if shorter than 32 characters |
| `GEMINI_API_KEY` / `GEMINI_API_SECRET` | Gemini **sandbox** trading credentials |

Optional:

| Var | Default | Purpose |
|---|---|---|
| `NODE_ENV` | — | `production` makes the auth cookie HTTPS-only |
| `PORT` | 3002 | Listen port |
| `CORS_ORIGINS` | localhost:3000,3001 | Comma-separated allowed browser origins (whitespace is trimmed) |
| `RUN_MIGRATIONS` | unset | `true` runs the one-shot destructive migration |
| `AUTH_RATE_MAX` | 20 | Auth attempts / 15 min / IP |
| `ORDER_RATE_MAX` | 30 | Orders / min / user |
| `MARKET_RATE_MAX` | 60 | Public market-data requests / min / IP |
| `GENERAL_RATE_MAX` | 300 | Requests / min / IP |
| `MAX_SSE_PER_IP` | 5 | Concurrent price streams per IP |
| `GEMINI_BALANCES_TTL_MS` | 3000 | Balance cache lifetime |
| `GEMINI_API_URL` / `GEMINI_WS_URL` | production public API | Public market-data overrides |
| `GEMINI_PRIVATE_API_URL` | sandbox | Must contain `sandbox` or the app refuses to boot |

Dashboard and frontend read `REACT_APP_API_URL`, `REACT_APP_LOGIN_URL`, and
`REACT_APP_DASHBOARD_URL` at build time.

---

## 9. Glossary

- **Paper trading** — trading at real prices without real money at risk. Here
  the orders are real and the funds are Gemini test funds.
- **Market order** — buy or sell now at whatever the market offers. Emulated
  here as an immediate-or-cancel limit priced to cross.
- **Limit order** — buy at most at $X, or sell at least at $Y. Rests in the
  book until the market reaches it.
- **Immediate-or-cancel (IOC)** — fill whatever can fill right now, cancel the
  rest. This is why a market order can come back partially filled and that is
  the final outcome, not a pending one.
- **Partial fill** — some of the order executed. `filledQty` records how much;
  it is not always `qty`.
- **Resting order** — an order live on the exchange's book, not yet filled.
- **Top of book / depth** — the best bid and ask prices and the quantities
  available at each.
- **Idempotency key** (`clientOrderId`) — a caller-supplied id that makes a
  retry safe: the same key never places a second order.
- **Staleness guard** — orders are refused when the cached price is older than
  30s, so nobody trades on dead data.

---

## 10. Numbers

- **8** tradable pairs · **12h** JWT lifetime · **30s** staleness guard ·
  **30s** REST poll · **2s** SSE broadcast · **5s** order reconciliation ·
  **15min** snapshot sweep · **1%** market-order cross
- **216** backend + **57** dashboard + **16** frontend tests
- **1** shared Gemini sandbox account · **1** market-data feed regardless of
  user count
