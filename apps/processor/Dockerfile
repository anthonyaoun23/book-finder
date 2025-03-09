FROM node:lts-alpine AS pruner

WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune --scope=processor --docker

FROM node:lts-alpine AS installer

WORKDIR /app
# Install packages needed for native modules using apt (not apk)
RUN apt-get update && apt-get install -y python3 build-essential unzip

COPY --from=pruner /app/out/json .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/turbo.json ./turbo.json
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

FROM node:lts-alpine AS builder

WORKDIR /app
COPY --from=installer /app/ .
COPY --from=pruner /app/out/full .
RUN npm install -g pnpm

# Generate Prisma client first
RUN cd packages/database && npx prisma generate

# Then build all packages
RUN pnpm run build

FROM node:lts-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
# Install additional runtime dependencies
RUN apk add --no-cache unzip
COPY --from=builder /app/ .

CMD ["node", "apps/processor/dist/main"] 