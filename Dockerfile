# syntax=docker/dockerfile:1.7

# ---- deps: install production-relevant dependencies with a cached layer ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=optional

# ---- builder: compile the Next.js app in standalone mode ----
FROM deps AS builder
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runner: minimal production image ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

# Standalone Next.js server output (requires `output: 'standalone'` in next.config.ts).
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Bundle the Node CLI (bin/wtp.mjs) so headless packing works from the same image.
COPY --from=builder /app/bin ./bin

EXPOSE 3000
USER node
CMD ["node", "server.js"]
