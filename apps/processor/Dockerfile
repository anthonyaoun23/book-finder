FROM node:18 AS pruner

WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune --scope=processor --docker

FROM node:18 AS installer

WORKDIR /app
# Install all packages needed for native modules including libzip-dev for zipfile
RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    unzip \
    libzip-dev \
    libz-dev \
    libbz2-dev \
    pkg-config

COPY --from=pruner /app/out/json .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/turbo.json ./turbo.json
RUN npm install -g pnpm
# Try to install with verbose logging to see more details if it fails
RUN pnpm install --frozen-lockfile --verbose

FROM node:18 AS builder

WORKDIR /app
COPY --from=installer /app/ .
COPY --from=pruner /app/out/full .
RUN npm install -g pnpm

# Generate Prisma client first
RUN cd packages/database && npx prisma generate

# Then build all packages
RUN pnpm run build

FROM node:18-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
# Install runtime dependencies for zipfile
RUN apt-get update && apt-get install -y \
    unzip \
    libzip4 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/ .

CMD ["node", "apps/processor/dist/main"] 