FROM node:22-bookworm-slim AS backend-build
WORKDIR /build/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS web-build
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN VITE_API_URL=/backend VITE_DASHBOARD_URL=/app/ npm run build
WORKDIR /build/dashboard
COPY dashboard/package*.json ./
RUN npm ci
COPY dashboard/ ./
RUN VITE_API_URL=/backend VITE_LOGIN_URL=/login VITE_BASE_PATH=/app/ npm run build

FROM node:22-bookworm-slim AS backend
ENV NODE_ENV=production PORT=3002
WORKDIR /app/backend
COPY --from=backend-build --chown=node:node /build/backend/package*.json ./
COPY --from=backend-build --chown=node:node /build/backend/node_modules ./node_modules
COPY --from=backend-build --chown=node:node /build/backend/dist ./dist
USER node
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD node -e "fetch('http://127.0.0.1:3002/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]

FROM caddy:2-alpine AS gateway
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=web-build /build/frontend/build /srv/landing
COPY --from=web-build /build/dashboard/build /srv/dashboard

# One process and one public origin for free full-stack web-service hosting.
FROM backend AS fullstack
ENV STATIC_SITE_ROOT=/app/sites
COPY --from=web-build /build/frontend/build /app/sites/landing
COPY --from=web-build /build/dashboard/build /app/sites/dashboard
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/backend/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
