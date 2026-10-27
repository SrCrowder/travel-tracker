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


# ─── Stage 2: Production image ────────────────────────────────────────────────
FROM node:20-alpine

# Keep build tools — needed to compile better-sqlite3 native bindings
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
# Install only production deps (this recompiles better-sqlite3 for this stage)
RUN npm install --omit=dev

# Copy compiled JS from build stage
COPY --from=builder /app/dist ./dist

# These paths are mounted as Docker volumes at runtime
RUN mkdir -p /app/data /app/uploads

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "dist/index.js"]
