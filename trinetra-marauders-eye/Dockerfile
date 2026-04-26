# =============================================================================
# Multi-stage Dockerfile — works on Railway, Render, Fly.io, Google Cloud Run,
# AWS App Runner, Azure Container Apps, Kubernetes, or just `docker run`.
# =============================================================================

# ---- Stage 1: build the client bundle ---------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

# pnpm via corepack (built into Node 20+)
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Install ALL deps (devDeps needed for vite build)
COPY package.json ./
COPY pnpm-lock.yaml* ./
RUN pnpm install --no-frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm build

# ---- Stage 2: lean runtime image --------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Copy only what's needed at runtime
COPY --from=builder /app/package.json /app/pnpm-lock.yaml* ./
RUN pnpm install --prod --no-frozen-lockfile && pnpm store prune

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/public ./public
COPY --from=builder /app/index.html ./
COPY --from=builder /app/tsconfig.json ./

# Railway/Render/Fly inject PORT; we listen on it via process.env.PORT
EXPOSE 5000

# Healthcheck hits /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-5000}/api/health || exit 1

CMD ["pnpm", "start"]
