# syntax=docker/dockerfile:1.7
#
# Multi-stage Bun + Vite + Hono image for the Phase 8 production stack.
# Phase 8 D-09 (Bun runtime), D-10 (build on the VM — arm64-native on
# Ampere A1). RESEARCH §Pattern 1 is the canonical template.
#
# Stage map:
#   deps    — install node_modules from a frozen lockfile (cache friendly).
#   builder — copy source, declare VITE_* build args, run `bun run build`
#             (tsc -b && vite build). VITE_* are inlined into dist/ JS.
#   runtime — minimal final image with non-root user 'app'. Ships only the
#             built dist/, server/, package.json, tsconfig*.json, plus
#             node_modules from the deps stage.

# --- Stage 1: deps -----------------------------------------------------------
FROM oven/bun:1-alpine AS deps
WORKDIR /app
# Copy lockfile + manifest only so the install layer caches across source
# edits. bun install --frozen-lockfile fails fast if bun.lock drifts.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# --- Stage 2: builder --------------------------------------------------------
FROM oven/bun:1-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# VITE_* values are inlined into dist/assets/*.js at build time. They MUST be
# passed via --build-arg (or compose build.args). See
# feedback_dual_runtime_env.md: dual-runtime projects need both the unprefixed
# server-side env (loaded at runtime via .env) AND the VITE_* prefixed copies
# (inlined at build time). Missing build args → undefined literals in bundle
# → Auth0 / MapTiler silently break in the browser.
ARG VITE_MAPTILER_KEY
ARG VITE_AUTH0_DOMAIN
ARG VITE_AUTH0_CLIENT_ID
ARG VITE_AUTH0_AUDIENCE
ENV VITE_MAPTILER_KEY=${VITE_MAPTILER_KEY}
ENV VITE_AUTH0_DOMAIN=${VITE_AUTH0_DOMAIN}
ENV VITE_AUTH0_CLIENT_ID=${VITE_AUTH0_CLIENT_ID}
ENV VITE_AUTH0_AUDIENCE=${VITE_AUTH0_AUDIENCE}

# tsc -b emits no runtime artefact (typecheck only); vite build writes dist/.
RUN bun run build

# --- Stage 3: runtime --------------------------------------------------------
FROM oven/bun:1-alpine AS runtime
WORKDIR /app

# Non-root runtime user. uid 1001 matches the Bun image convention; the
# alpine 'adduser -S' creates a system account without a login shell.
RUN addgroup -g 1001 -S app && adduser -u 1001 -S app -G app

COPY --from=deps /app/node_modules ./node_modules

# The API container serves the Vite `dist/` via `hono/bun`'s `serveStatic`
# mount (see server/index.ts; RESEARCH Pattern 1 / Code Example 2).
# Nginx (08-02) upstream-proxies all non-API requests to this API and
# overlays cache headers on /assets/* via a separate location block. The
# runtime stage therefore MUST ship the built dist/ so Hono can read it
# from /app/dist at request time.
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig*.json ./

USER app
EXPOSE 8787
CMD ["bun", "run", "server/index.ts"]
