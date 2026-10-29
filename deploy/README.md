# Deployment package

The `fullstack` Docker target runs all three apps in one unprivileged Node process, suitable for a single free Render web service. The optional separate Caddy gateway/backend targets remain available for a prepared server.

This package runs the landing page at `/`, dashboard at `/app/`, and API at `/backend/` on one origin. Both browser apps are built with relative API URLs; the dashboard has a configurable Vite/React Router base path. Login cookies therefore travel with both apps without relying on third-party cookies.

The backend image uses the production Node runtime, runs as the unprivileged `node` user, and has a readiness health check. The gateway image serves only the compiled browser files through Caddy; API streams are proxied without response buffering. `.dockerignore` excludes local environment files, credentials, and dependency/build directories. No credentials are copied into either image.

## Local verification

Install Docker and start its daemon, then run from the repository root:

```bash
npm run test:deployment
```

This builds the gateway and fullstack images, extracts the exact compiled browser bundle, and starts an isolated production-mode fullstack backend with temporary MongoDB behind a local HTTPS test proxy. The browser signs up through HTTPS, reaches `/app/`, verifies a Secure/HttpOnly/SameSite=Lax cookie, reloads a nested route, verifies its assets, and logs out. It uses a local self-signed Caddy certificate with certificate verification disabled **only in that test**. It does not prove that a public certificate or AWS deployment works. Test exchange credentials are blank and no live sandbox order is submitted.

The test currently targets the installed Colima runtime through `host.lima.internal`; it is separate from ordinary `npm run check`. The gateway container, backend process, and temporary MongoDB are stopped afterward. Colima itself remains running.

Both production targets can be built independently:

```bash
docker build -f deploy/Dockerfile --target backend -t bluechip-backend:predeploy .
docker build -f deploy/Dockerfile --target gateway -t bluechip-gateway:predeploy .
```

## Run on a prepared server with a hostname

Provision the host and review its billing eligibility before using this section. Install Docker Compose. Copy the project and securely provide `backend/.env` on that server with restrictive filesystem permissions. Supply `MONGO_URL`, a strong `TOKEN_KEY`, sandbox credentials, and the selected operator ID; keep the backend environment file out of Git and images. Do not paste secrets into terminal commands or commit them.

Point a hostname you control to the host, allow HTTP/HTTPS to the gateway, and run:

```bash
PUBLIC_ORIGIN=https://your-hostname.example SITE_ADDRESS=your-hostname.example \
  docker compose -f deploy/compose.yaml up --build -d
```

Caddy obtains a publicly trusted certificate when the hostname is correctly configured and reachable. Keep its data volume across restarts to retain certificates. Only gateway ports are published; the backend is reachable inside the Compose network. Run exactly one backend instance. Stop any previous backend using the same Gemini API key before enabling the deployed writer, because nonce state is process-local.

Compose forces production mode, SameSite=Lax, the final allowed browser origin, and `RUN_MIGRATIONS=false`. It does not run the legacy destructive migration. The backend waits for its indexes and readiness before the gateway is started. Existing MongoDB records remain in the configured database; this package does not migrate or replace them.

## AWS account and domain status

No AWS resources have been created. An AWS account ID identifies an account but does not grant console/API access. The account plan, credits, region eligibility, and resource permissions must be inspected in an authenticated session before deployment under the user's free-only constraint.

AWS's current Free account plan is limited by time and credits; an existing account is not automatically eligible. Check [AWS plan conditions](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html) and [EC2 eligibility](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-free-tier-usage.html). Do not launch paid-plan resources or assume an alert enforces a zero spending limit.

A purchased domain is not mandatory: CloudFront can provide its own HTTPS hostname. The prepared path layout supports that single origin. An AWS topology still needs to be chosen after account/billing inspection, including secure origin connectivity, outbound access to MongoDB/Gemini, caching disabled for `/backend/*`, forwarding auth cookies and request headers, all API HTTP methods, and suitable streaming timeouts. [CloudFront VPC origins](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-vpc-origins.html) can restrict access to the application origin, but outbound networking and all associated costs must be evaluated before provisioning. This is a remaining deployment step, not a claim that CloudFront or EC2 is configured.

## Public acceptance checks

After deployment, verify the trusted HTTPS certificate, `/backend/readyz`, landing routes, signup/login, `/app/orders` after reload, operator access, logout/session revocation, and delayed-data behavior. Inspect the actual Secure/HttpOnly cookie in the target browsers. Private API responses must never be cached by a CDN. Repeat sandbox write validation only deliberately; `npm run check` and `npm run test:deployment` do not perform live exchange writes.

## Opt-in live sandbox lifecycle check

With the normal local API running and an existing operator allowlisted:

```bash
node scripts/validate-sandbox.mjs --execute --user-id=YOUR_OPERATOR_MONGODB_ID
```

This explicitly creates at most two BTC sandbox limit orders, each capped at $5 of test-fund notional, and cancels its own test orders. It verifies ordinary placement/cancellation, deliberately discards one successful exchange acknowledgement, verifies idempotent replay, waits for the running background reconciler, then cancels the recovered order. `--recovery-only` runs only the second case. The script disables external monitoring delivery for its failure injection, retains local order/event records, and does not cancel unrelated orders. It requires a recently built backend and the normal local API on port 3002. Check the final cleanup report after every execution.

## Render Free deployment

`render.yaml` defines exactly one Docker web service with `plan: free` and automatic deploys disabled. The Dockerfile’s final target is `fullstack`; it includes the landing and dashboard builds and mounts the API at `/backend/`. Render supplies managed HTTPS and an `onrender.com` hostname. Its external URL is used as the default allowed CORS origin. The readiness path is `/backend/readyz`. No paid worker, disk, database, additional instance, or custom domain is provisioned.

Set server-only `MONGO_URL`, a newly generated production `TOKEN_KEY`, `GEMINI_API_KEY`, `GEMINI_API_SECRET`, and `OPERATOR_USER_IDS`. Keep production mode, SameSite=Lax, and `RUN_MIGRATIONS=false`. The existing local backend must be stopped before the cloud backend uses the same Gemini key. Store secrets in Render's private environment settings; never in source or frontend build variables.

The selected Hobby workspace currently has no card on file and unused monthly allowances. Keep it that way for the free-only requirement. Render documents that free services are suspended when bandwidth allowances are exceeded without a payment method; builds are disabled when build minutes are exhausted. Do not add a card or upgrade the instance/workspace to bypass limits. See [Render's free-service limits](https://render.com/docs/free).

Free web services sleep after 15 minutes without inbound traffic and may take about a minute to wake. While asleep, the backend performs no reconciliation or snapshots, although a resting Gemini order can still fill. On waking, durable intents and active orders are looked up again. The UI must not be presented as continuous account monitoring. This is a portfolio/demo deployment, not an always-on trading service. No artificial keep-alive automation is added.

The deployment source is an isolated branch in the existing private repository, which currently resolves as `BlueChip-archive`. Its privacy and default branch are preserved. Publishing the app and transferring existing database/exchange credentials to Render are a separate final approval step after builds, tests, and service settings are reviewable.
