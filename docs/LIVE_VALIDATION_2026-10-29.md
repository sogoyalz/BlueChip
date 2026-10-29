# Live validation — October 29, 2026

Latest follow-up: all required indexes are now present, operator access is configured locally, and actual sandbox placement/cancellation/recovery passed. See [PREDEPLOYMENT_STATUS.md](PREDEPLOYMENT_STATUS.md). The earlier missing-index list below records the initial inspection.

These checks were executed from the development machine. They do not establish that a hosted application works.

| Check | Observed result |
| --- | --- |
| Public sandbox `/v1/symbols` | HTTP 200; 392 symbols, including BTCUSD |
| Sandbox BTCUSD and DOGEUSD metadata | HTTP 200; both open; positive tick, quote increment, and minimum size |
| Public sandbox BTCUSD ticker | HTTP 200; positive close |
| Configured MongoDB | Connection, ping, collection inspection, and order-index inspection succeeded, read-only |
| Hosted landing/dashboard/API | Not tested: URLs are unknown and not configured locally |
| Authenticated sandbox reads | After credentials were configured: balances and active-order reads passed through the backend client; no order writes/cancellations performed |
| Backup/restore rehearsal | Passed with generated fixtures on two isolated temporary MongoDB servers |

The read-only database inspection found these required order indexes missing:

- `exchangeClientOrderId_1`
- `userId_1_createdAt_-1__id_-1`
- `userId_1_status_1_createdAt_-1__id_-1`
- `status_1_lastCheckedAt_1__id_1`
- `status_1_createdAt_1__id_1`

The existing `userId_1_clientOrderId_1` index is unique and partial. No database indexes or business records were changed by the live checks. Startup of the updated backend creates its required indexes before listening; review uniqueness/data compatibility and database permissions before rollout. The legacy destructive migration is a separate procedure and was not run.

Repository metadata had no homepage, GitHub Pages site, deployments, or commit-status deployment target. This is incomplete discovery evidence: hosting could exist outside GitHub. It does not prove that the project is undeployed.

Run `npm run validate:live` from the repository root to repeat the checks. It uses public sandbox GETs and direct MongoDB reads, without importing application models. Optional `LIVE_LANDING_URL`, `LIVE_DASHBOARD_URL`, and `LIVE_API_URL` enable HTTPS reachability/readiness checks. A skipped check is reported explicitly; exit code zero does not mean skipped checks passed. Missing indexes are reported for rollout review; connectivity can pass while indexes remain missing. The script does not validate browser cookies, CORS, authenticated order behavior, or deployment credentials.

Run `npm run rehearse:restore` with MongoDB Database Tools installed to repeat the fixture exercise. It creates two temporary servers, dumps generated order/event data, restores into the other server, compares documents/indexes, and verifies the restored uniqueness constraint. It never reads `.env`, configured database data, or real account backups. This is tooling verification, not a production disaster-recovery drill. Temporary servers and archives are cleaned up afterward.

Final local verification also passed all three builds and 655 tests: 394 backend, 200 dashboard, 34 landing, and 27 Chromium browser tests. The browser order journey included the new activity view, server-side operator denial, an axe accessibility scan, a phone-width overflow assertion, and inspected desktop/mobile screenshots. Browser exchange traffic used the local stub.

## Follow-up review after credential setup

Authenticated balance and active-order reads passed through BlueChip's actual private client. Five positive holdings were loaded; numeric cash and portfolio totals were finite. No credentials or account amounts were printed. No sandbox trade or cancellation was submitted.

A check of the normal price-feed list found funded BCH and ZEC balances uncovered. The earlier isolated valuation check had explicitly fetched quotes for all holdings, which did not establish that the normal poll covered them. Both pairs were confirmed listed on Gemini and added to the curated feed. A second live check used only the normal `pollOnce()` plus account services: all five holdings were priced and valuation was complete. Assets outside the curated list still deliberately produce an incomplete valuation.

The review also reproduced browser decimal conversion and invalid execution-price handling with regression tests. The trade form now sends the original quantity/limit decimal strings for server-side increment validation. Reconciliation no longer converts null, empty, zero, or negative average-price fields into a displayed execution price. A browser accessibility scan reproduced low-contrast success notification text; notification styling was corrected in both browser apps.

Runtime-only npm audits were repeated for backend, dashboard, and frontend: each reported zero known vulnerabilities. `backend/.env` is ignored by Git. The earlier five missing database indexes and unknown deployment URLs remain unresolved. Local application ports were stopped at the preceding check; automated browser verification uses an isolated fixture stack rather than a deployed application.

The final whole-project pipeline passed all three production builds and **661 tests**: 399 backend, 201 dashboard, 34 landing, and 27 Chromium browser tests. The previously failing notification accessibility scan passed after correction. Six added regression cases first reproduced the decimal, invalid-price, and default-funded-asset issues before their fixes. `git diff --check` and root script syntax checks passed. The dashboard bundle-size warning and previously documented development-tool advisories remain.

The predeployment follow-up supersedes the earlier five-missing-index status: the configured database now has all required indexes, including the unique partial exchange client-ID index. Actual sandbox limit-order placement, cancellation, and lost-acknowledgement recovery passed after correcting the array-shaped client-ID status response. Three test orders are cancelled and unfilled. All three builds, 666 regular tests, and one additional local HTTPS deployment test passed; public AWS deployment remains pending console access and free-plan verification.
