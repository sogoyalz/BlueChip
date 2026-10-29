# Operating BlueChip

## Runtime and local commands

Use Node 22.22.2 or newer; `.nvmrc` records the minimum development runtime. The root package is a command runner, not a replacement for the four application lockfiles. Configure `backend/.env` from its example, run `npm run setup`, then `npm run dev`. Use `npm run setup:browsers` before the first browser run. `npm run check` builds all apps and executes unit, database integration, and browser suites.

Tests use temporary databases. First runs may download mongod and Chromium; a local HTTP listener must be permitted. The browser stack uses only its explicitly enabled loopback exchange stub, including market metadata, and disables external WebSocket market data. It does not place live sandbox or production trades. Keep `MONITORING_WEBHOOK_URL` unset when running failure-injection tests against local fixtures.

## Order submission contract

`POST /api/orders` takes `symbol`, `side`, `type`, `qty`, optional `limitPrice`, and an optional `clientOrderId`. Browser clients always supply a stable UUID for each logical order. Without a supplied key, every request is a distinct new order. Reuse a supplied key only with the same instructions. Amounts/prices may be decimal strings; valid precision is preserved and incompatible increments are refused.

The server validates sandbox symbol metadata and creates a durable PENDING order before making the exchange write. A unique `(userId,clientOrderId)` index elects one submitter. A separate UUID identifies the order on the shared exchange account. A SHA-256 hash of canonical instructions rejects edited-key reuse with HTTP 409. Exact submitted decimal strings are stored alongside the existing numeric display fields.

HTTP 201 contains a confirmed order outcome. HTTP 202 contains a tracked PENDING or UNKNOWN order; it does not mean that the order failed or that another order should be placed. A timeout, network failure, incomplete response, or ambiguous upstream error must not trigger blind resubmission. The reconciler uses the persisted exchange client ID to recover the result, including after a process restart or failed acknowledgement write.

Fresh PENDING rows get a 30-second response/restart window before lookup. Failed lookups yield their reconciliation turn and back off for 30 seconds. The scan is ordered by last observation, not creation date, so long-lived orders cannot permanently starve later rows. It still caps work and private lookups per pass. Terminal exchange observations retain the existing monotonic filled-quantity protection.

Legacy rows missing both exchange identifiers are marked UNKNOWN with a manual-review reason and deferred for 24 hours. This keeps an entire capped page of unresolvable legacy records from blocking valid orders. Quarantine updates are conditional, so an identifier or newer status written concurrently is not overwritten. This does not discard history or claim the exchange order was cancelled.

Market freshness is checked after fetching metadata and again after recording the intent. A quote that expires during either wait cannot be submitted. A null exchange response becomes an explicitly UNKNOWN record instead of throwing before validation. Partially filled limit orders retain their resting-remainder message; an IOC's cancelled remainder does not hide the amount that executed.

An intent interrupted before any HTTP write can remain unresolved because “not found” alone does not prove that an earlier request could not still arrive. Such orders require investigation; this release does not provide an automated operator override or infer exactly-once external execution. Check exchange order history/client IDs and logs before taking a corrective action. Do not delete UNKNOWN rows to permit a retry.

## Compatible rollout and database requirements

New order fields and PENDING/UNKNOWN statuses are additive. Existing orders keep their recorded instructions and exchange IDs; no trade is replayed or rewritten. New optional fields include `requestHash`, `exchangeClientOrderId`, `submittedAmount`, `submittedPrice`, `lastCheckedAt`, and `nextCheckAt`.

Startup waits for required order indexes before listening. New indexes cover the exchange client ID, user history with the `_id` tie-breaker, filtered history, and reconciliation scheduling. A database account that cannot create indexes needs a separately provisioned index deployment; startup must not silently continue without uniqueness protection.

If the database still has the historical sparse `userId_1_clientOrderId_1` index, use the existing `RUN_MIGRATIONS=true` procedure in a maintenance window, with **all old writers stopped**. That migration removes obsolete ledger collections/fields and replaces the old index; back up first and independently verify the partial unique index. The migration now throws if its required index postcondition fails. Unset the flag afterward. This work did not run that migration against a configured or production database.

Do not run older backend code alongside the new release during rollout: old code does not understand pending orders or reserve them before submission. No new multi-document transaction requirement was introduced. A versioned general migration framework remains future work.

## Balances and valuation

`balance` is total USD cash, including order holds. `availableBalance` is cash available for another trade. Portfolio value uses total cash plus holdings; it must not subtract held cash a second time. Placing/cancelling orders invalidates balance caches even when no new fill occurred. `GEMINI_BALANCES_TTL_MS=0` now disables caching as documented.

Zero non-USD balances do not require a market price. Missing, invalid, or stale quotes make valuation incomplete and prevent snapshot persistence. Holdings omit stale price enrichment. The curated feed includes BCHUSD and ZECUSD so the default sandbox-funded holdings can be priced. Other assets outside the list still make valuation incomplete. The dashboard shows unavailable totals honestly, and refreshes account/history data after submissions and periodically to observe other users' trades. The 24-hour market-move estimate applies price returns to the current holdings; it is not realized or acquisition-cost profit.

## API history and health

`GET /api/orders` returns an array of at most 100 owned orders. `status=all|open|pending` and an optional symbol filter narrow the list. `X-Next-Cursor` supplies the next cursor, and `X-Total-Count` describes the whole selected filter. Ordering is `(createdAt DESC,_id DESC)` so tied timestamps do not lose rows. Cursors are not credentials; ownership is always independently enforced.

- `/livez`: process responds.
- `/readyz`: 200 when MongoDB is connected; 503 otherwise. Market freshness and WebSocket status are reported as degradation signals, not liveness failures.
- `/healthz`: retained for existing callers.

Render now uses `/readyz` and `npm ci`. Keep one backend instance: nonce generation, rate-limit state, caches, and SSE membership remain in process. Deploy frontends/API under one registrable domain where practical and verify HTTPS cookie behavior in the real target browsers. No live deployment or proxy topology was verified in this change.

## Configuration and safeguards

Create an account-scoped sandbox Trader key. This REST client uses increasing millisecond nonces, so configure incremental nonce validation rather than time-based nonce validation. Leave Requires Heartbeat disabled: the app does not run a dedicated heartbeat sender. Store the key/secret only in backend configuration and restart the backend after changing them.

Private exchange requests accept only `https://api.sandbox.gemini.com` (an optional trailing slash is normalized). Paths, credentials, queries, fragments, production origins, and similar-looking domains are rejected. A loopback `/sandbox` test override additionally requires `NODE_ENV=test` and `GEMINI_ALLOW_TEST_URL=true`; it cannot enable production HTTP trading.

`GEMINI_TIMEOUT_MS` must be an integer from 1–60000; balance TTL is 0–60000. SSE per-IP/global caps use validated positive integers. SSE clients that cannot accept a frame are closed rather than buffered indefinitely; browsers can reconnect. Set `MAX_SSE_CLIENTS` only after capacity testing, not as a throughput claim.

New signup passwords are limited to 72 UTF-8 bytes because bcrypt does not authenticate suffixes beyond that bound. Existing login policy remains compatible to avoid silently locking legacy accounts out. Logout conditionally revokes only the presented token version, so replaying a previously revoked token cannot invalidate a later login. Self-service password reset is not implemented in this release and help content says so.

## Validation and remaining work

Use the verification totals in the implementation status at the top of `BLUECHIP_ENGINEERING_PLAN.md`. Recovery tests exercise a real temporary MongoDB with exchange calls mocked, including concurrent same-key requests, lost responses, persisted interrupted intents, failed acknowledgement writes, payload conflicts, and more than 500 resting rows. History tests cover tied timestamps and ownership across pages.

Future work includes investigated operator resolution workflows, exports, password recovery delivery, a migration ledger, full monitoring metrics, production backup/restore drills, deployment-domain checks, and measured capacity testing. Bounded recent activity and lookup scheduling are implemented below. Those are not implied by passing local tests. The initial dashboard bundle still needs measured optimization; no unsupported performance or user-count claim should be added to the resume.


## Order diagnostics and operator access

Each new intent and accepted state change appends an event in the same atomic order write. The order retains at most 50 recent local events; this is bounded diagnostic history, not an immutable or complete audit ledger. No backfill invents events for old orders. Repeated unchanged observations are skipped by reconciliation, repeated identical lookup failures do not append new events, and stale exchange observations cannot append a state-change event. Raw upstream error bodies are not stored in diagnostic events.

`GET /api/orders/:id/diagnostics` returns details for the owner or an explicitly configured operator. Non-owners receive 404; unauthenticated requests receive 401. The dashboard's Orders table links to `/orders/:id`, showing exact submitted decimal strings, exchange/client references, recent activity, check times, recorded attempt count, and recovery mode. The view refreshes every ten seconds. The attempt count begins with this release; it is not historical lifetime activity.

Set `OPERATOR_USER_IDS` to a comma-separated allowlist of existing MongoDB user `_id` values in the backend environment. Empty means no operators; no signup automatically receives access. Malformed entries fail startup validation. `GET /api/session` provides username and operator visibility without needing a working private exchange connection. Ordinary order responses exclude hashes and internal event actors.

Operator endpoints enforce authorization on the server, regardless of menu visibility:

- `GET /api/operations/orders`: unresolved PENDING/UNKNOWN orders across owners, oldest first, 50 per page; use the JSON `nextCursor` for subsequent pages. Total and reconciliation health accompany the page.
- `POST /api/operations/orders/:id/reconcile`: schedules a status lookup of an existing unresolved order. Requires the normal CSRF header, an exchange identifier, the 30-second original-submission window to have elapsed, and a 30-second per-order recheck cooldown. Ten requests per minute per operator are permitted. It records the actor and changes scheduling only.

A recheck never sends a replacement trade, cancels an exchange order, assigns a guessed exchange ID, or forces a terminal state. Missing-identifier records require investigation outside this UI. Exchange client references should be checked against the shared sandbox account before any corrective action. A scheduled lookup still depends on working private credentials and reconciliation capacity. The dashboard reports these limitations.

Reconciliation attempt counts and safe last-error codes persist on each order. Last-pass counts, active state, start/completion times, and pass failure codes are process-local and reset on restart; they are not historical monitoring metrics. An active-list failure is visible in pass health even though no individual lookup was attempted.

New optional persistence fields include `recentEvents`, `reconciliationAttempts`, `lastReconciliationCode`, `lastReconciliationErrorAt`, and `lastOperatorRecheckAt`. An additive `(status,createdAt,_id)` index supports the operations queue; no new transaction or separate event collection is required.

## Repeatable external checks and fixture restore

`npm run validate:live` performs read-only public sandbox and configured database checks. Optional `LIVE_LANDING_URL`, `LIVE_DASHBOARD_URL`, and `LIVE_API_URL` enable HTTPS reachability/readiness probes. It reports skipped checks and missing indexes explicitly and does not trade or apply indexes. See [LIVE_VALIDATION_2026-10-29.md](LIVE_VALIDATION_2026-10-29.md) for executed results and limitations.

`npm run rehearse:restore` requires `mongodump`/`mongorestore` on PATH. It dumps and restores generated fixtures between two temporary MongoDB servers and verifies data plus unique-index behavior. It never accesses configured database data. An actual backup policy, encrypted off-host retention, and recovery of real data into a separately provisioned target still need an operational exercise.
