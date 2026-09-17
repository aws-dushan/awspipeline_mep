# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Pipeline Tracker - production image
#
# Three stages so the shipped layer carries neither the source nor the build
# toolchain: install, build, run. The runtime stage is Next's `standalone`
# output, which is a self-contained server plus only the node_modules it was
# traced to actually use.
#
# The base path is a BUILD argument, not a runtime one. Next compiles the
# prefix into every asset URL, every Server Action endpoint and every <Link>
# as it builds, so an image built for /awsmepplt cannot be served anywhere
# else. It must match the nginx `location` on the edge; changing one alone
# produces a page whose HTML loads and whose scripts all 404.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS base
# Prisma's query engine is linked against OpenSSL, and the Alpine image does
# not carry it. Without these the client fails at first query, not at build.
RUN apk add --no-cache libc6-compat openssl

# --- dependencies ----------------------------------------------------------
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
# Playwright is a devDependency used only by the QA script; its postinstall
# would pull three browsers into a layer nothing runs them from.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci --no-audit --no-fund

# --- build -----------------------------------------------------------------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG APP_BASE_PATH=""
ENV APP_BASE_PATH=$APP_BASE_PATH
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# Every page is server-rendered on demand, so nothing here touches the
# database. Prisma still insists on a syntactically valid URL to generate
# against; this one is never connected to.
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public"
RUN npm run build

# --- runtime ---------------------------------------------------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# Bind on all interfaces: the only thing that can reach this port is the edge,
# across the Docker network. The container publishes nothing to the host.
ENV HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# `next start` refuses to serve a standalone build. The traced server is the
# entry point, and it is the only supported one.
CMD ["node", "server.js"]
