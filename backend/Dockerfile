# ─── Stage 1: Build TypeScript ────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Native build tools required by better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
# Install ALL deps (including dev) so TypeScript compiler is available
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Drop dev deps; better-sqlite3 stays compiled for this same base image
RUN npm prune --omit=dev


# ─── Stage 2: Production image ────────────────────────────────────────────────
# No build tools here: the compiled node_modules come from the build stage
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# Copy compiled JS from build stage
COPY --from=builder /app/dist ./dist

# These paths are mounted as Docker volumes at runtime
RUN mkdir -p /app/data /app/uploads

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "dist/index.js"]
