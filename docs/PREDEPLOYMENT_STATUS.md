# Predeployment status — October 29, 2026

**Current status: deployed.** The landing page, dashboard, and API run at [bluechip-hn6y.onrender.com](https://bluechip-hn6y.onrender.com/) on Render Free with MongoDB Atlas Free. The sections below record earlier preparation and resolved blockers.

| Item | Verified status |
| --- | --- |
| Required database indexes | All present; ten total order indexes, including the required partial unique indexes. No index mutation or destructive migration was needed in this run. |
| Operator access | Selected existing account added to the ignored local backend environment allowlist; authenticated `/api/session` confirmed operator access in the running API. The allowlist must also be supplied to the cloud runtime. |
| Actual sandbox placement/cancellation | A low-price BTC limit was accepted as OPEN and cancelled through the application API. |
| Actual sandbox recovery | A successful exchange acknowledgement was deliberately discarded. The intent became UNKNOWN; same-key replay returned the original order; the running background reconciler recovered its real exchange ID and OPEN state; cancellation succeeded. |
| Sandbox cleanup | All three test orders from the initial checks and successful retest are CANCELLED with zero executed quantity. Unrelated orders were not cancelled. |
| Production builds and regular tests | All three builds and 666 tests passed: 404 backend, 201 dashboard, 34 landing, 27 Chromium browser tests. |
| Production container builds | Backend and Caddy gateway targets built successfully; Compose and Caddy configuration validation passed. Local images are `bluechip-backend:predeploy` and `bluechip-gateway:predeploy`. |
| Local HTTPS deployment check | One additional browser test passed with a production-mode backend and isolated MongoDB. It verified Secure/HttpOnly/SameSite=Lax cookies, same-origin login, `/app/` routing/assets, a nested reload, proxied API access, and logout/session revocation. |
| Public AWS deployment | **Account is now ACTIVE and EC2 is accessible. Read-only account metadata confirms the legacy EC2 free-tier period has expired; billing shows no active credits. Deployment awaits a hosting/budget decision under the user’s free-only requirement. No EC2, storage, or network resources were provisioned.** |

The live recovery test uncovered a real sandbox contract difference: client-ID order-status requests return an array, whereas order-ID requests return an object. The private client now selects exactly one matching client ID and rejects missing or ambiguous array matches. Five additional private-client tests cover this behavior. It never selects an unrelated order or resubmits an unresolved intent.

The deployment package uses one origin: landing at `/`, dashboard at `/app/`, and API at `/backend/`. This avoids relying on third-party cookies. See [deployment instructions](../deploy/README.md).

The local HTTPS fixture uses a self-signed localhost certificate and explicitly disables certificate checking for that fixture only. Public AWS certificate trust, DNS/CDN configuration, actual cloud cookies, and cloud runtime access remain untested. The fixture uses blank exchange credentials and does not submit live trades. Live sandbox write validation was a separate explicitly authorized test.

Commands used:

```bash
MONITORING_WEBHOOK_URL= npm run check
npm run test:deployment
npm run validate:live
```

The e2e TypeScript check, root/script syntax checks, and `git diff --check` also passed. Local deployment-test containers, fixture backend, and temporary database were cleaned up; existing unrelated containers were left untouched. Colima remains running with the built images available.

The account ID supplied for AWS is not an authenticated session. Sign in to the intended account in the console before provisioning. No permanent access keys need to be posted in chat. AWS free-only eligibility is not established by having an account; review the actual plan and remaining credits first. A purchased domain is optional because CloudFront can supply a public HTTPS hostname, but that cloud topology is not yet configured.

AWS console follow-up: the signed-in account identity matched the account supplied by the user. Cost totals were unavailable; opening both EC2 and Free Tier redirected to the AWS incomplete-registration notice. The notice permits either unfinished registration or free-plan limitations, so it does not independently prove which requirement is missing. The registration link led to Billing Information but no usable form loaded, including after one reload. No payment information was entered, plan upgraded, or resource launched. The activation notice was left open for the user to complete or resolve with AWS support.

After the user completed account activation, EC2 and billing became accessible. A read-only CloudShell `account get-account-information` call confirmed an ACTIVE account older than the legacy 12-month EC2 free-tier window. Credits showed zero active credits and $0 remaining. The launch form displayed on-demand compute pricing and warned that charges depend on account eligibility; no launch was submitted. CloudShell was used only for read-only account checks and its panel was closed afterward. The deployment remains ready locally, but provisioning paid resources would require the user to change the free-only constraint.

## Strictly free hosting follow-up

The user chose strictly free hosting after AWS account verification showed the legacy EC2 free-tier period had expired and there were no active credits. Render's existing Hobby workspace was inspected: no card on file, zero current free-instance hours, zero current bandwidth, and zero pipeline minutes used. Existing unrelated services were not changed. No paid AWS resources were provisioned.

A new optional one-service hosting wrapper serves the two SPAs and API from one origin. API-only local development remains unchanged. The first HTTPS test reproduced a trailing-slash redirect loop at `/app/`; strict outer routing and an explicit dashboard-home regression assertion corrected it. The fullstack image then passed the real production-mode HTTPS browser journey, including Secure/HttpOnly cookies and a JSON 404 for unknown API routes.

Latest verification: all three production builds and **669 regular tests** passed (407 backend, 201 dashboard, 34 landing, 27 browser), plus **one separate local HTTPS deployment browser test**, for **670 across both commands**. E2E TypeScript, Compose/Caddy validation from the prior package, and script/diff checks passed. A scan of all candidate source files found no occurrences of configured database, JWT, or Gemini credentials.

Render Free sleeps when idle, pausing reconciliation/snapshots until the app wakes. This trade-off is documented in the deployment guide. Public service creation, private runtime credential transfer, and live HTTPS checks remain the final deployment steps.

## Render deployment attempt

The new `sogoyalz/BlueChip` repository was uploaded to `main`. A Render Free Docker service was created with manual deployments, readiness at `/backend/readyz`, and the authorized runtime configuration stored privately. The cloud build passed. The assigned address is `https://bluechip-hn6y.onrender.com`, but the application is **not ready for use**: startup cannot connect to the configured MongoDB instance because it runs on the developer's laptop (`localhost`). No local backend was listening on port 3002 when deployment began.

The remaining prerequisite is a hosted MongoDB database. MongoDB Atlas offers a Free cluster; account sign-in/setup remains a user action. No database migration, public network allowlist change, or paid database provisioning has been performed. Existing local data remains unchanged. After a cloud database is configured, update Render's private `MONGO_URL`, decide which local data should be migrated, redeploy, and verify public HTTPS authentication and the dashboard.

The read-only live validation script now preserves configured URL paths, so `/app/` and `/backend/readyz` are checked correctly when all services share one origin.

## Successful cloud deployment

The existing Atlas Free cluster was resumed without upgrading its tier. A dedicated application user has `readWrite` access to the `bluechip` database. A read-only connection test accepted its saved credential. Render's private `MONGO_URL` was updated to Atlas; the redeployment connected to MongoDB, subscribed to Gemini market data, and reached Live status. No Atlas network allowlist changes or paid resources were created.

With explicit user approval, the existing local `bluechip` database was copied into Atlas while preserving document IDs: 10 users, 9 sandbox orders, 5 holdings, and 244 portfolio snapshots. Every copied ID was verified at the destination, required indexes are present, and a private local backup was saved outside the repository. This preserves the selected operator account ID. The currently configured local development URL points to a separate empty `bluechip_app` database; the migration explicitly used the existing `bluechip` database and did not change the local environment file.

Public trusted-HTTPS checks passed for the landing page, login page, dashboard home, nested orders route, logo asset, readiness, prices, and symbols. Unknown API routes return JSON 404 responses. Orders, session, holdings, and operator endpoints reject anonymous requests with 401. The live validation command passed all public sandbox, Atlas index, and deployed URL checks. An explicitly approved temporary account verified signup, Secure/HttpOnly/SameSite=Lax cookies, authenticated session/orders/holdings/account reads, and logout revocation. No new trades were placed during deployment checks.

Runtime secrets are private Render environment values and are excluded from the repository and client bundles. Render Free idle sleep and paused background work remain portfolio-demo limitations. No external alert destination is configured; operational alerts remain in server logs.

Final browser verification confirmed login opens the deployed dashboard, the nested orders route survives a full reload, and holdings render all five funded sandbox assets. The test account placed no orders and was deleted after verification; the original ten accounts and nine orders remain. A subsequent idle wake returned readiness HTTP 200. A final scan of all 294 tracked files found no configured credential values, including the new Atlas password.

## Operational follow-up

The ignored local `MONGO_URL` was corrected from the empty `bluechip_app` database to the existing local `bluechip` database. Private Atlas backup configuration and a separate encryption key were saved locally, not in Git or browser bundles. An encrypted backup was created and restored into an isolated temporary MongoDB server: all 270 documents and indexes matched, and ciphertext tampering was rejected. Daily backups, Monday restore verification, and hourly aggregate database/order/backup monitoring are scheduled through the desktop app, with actionable alerts delivered in this chat. Initial monitoring found no unresolved orders. These scheduled jobs require the local computer and app to be available; immediate server-log webhook delivery is not enabled. Render's idle sleep remains a deliberate free-tier limitation.
