# ─── Stage 1: Production dependencies ─────────────────────────────────────────
FROM node:24-alpine AS deps

# Native build tools, in case better-sqlite3 has no prebuilt binary
RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package.json package-lock.json ./
# Exact versions from the lockfile, runtime deps only
RUN npm ci --omit=dev


# ─── Stage 2: Build TypeScript ────────────────────────────────────────────────
FROM deps AS builder

# Dev deps too (TypeScript compiler)
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build


# ─── Stage 3: Production image ────────────────────────────────────────────────
# No build tools here: the compiled node_modules come from the deps stage
FROM node:24-alpine

# su-exec: the entrypoint fixes volume ownership as root, then drops to "node"
# ffmpeg/ffprobe: video metadata, posters and conversion of iPhone .mov (HEVC) to MP4
RUN apk add --no-cache su-exec ffmpeg

WORKDIR /app

COPY package.json package-lock.json ./
COPY --from=deps /app/node_modules ./node_modules

# Copy compiled JS from build stage
COPY --from=builder /app/dist ./dist
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# These paths are mounted as Docker volumes at runtime
RUN mkdir -p /app/data /app/uploads && chown node:node /app/data /app/uploads

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
