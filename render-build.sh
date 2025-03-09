#!/usr/bin/env bash
# Exit on error
set -e

# Install pnpm
npm install -g pnpm

# Install dependencies
pnpm install

# Build the project (only what's needed based on the service)
if [ "$RENDER_SERVICE_NAME" = "book-finder-api" ]; then
  echo "Building API..."
  pnpm turbo build --filter=api
  
  # Run migrations if this is the API service
  echo "Running database migrations..."
  cd apps/api
  
  # If using Prisma
  if [ -f "node_modules/.prisma/client/index.js" ] || [ -f "node_modules/.prisma/client/index.d.ts" ]; then
    echo "Detected Prisma, running migrations..."
    npx prisma migrate deploy
  else
    echo "No ORM detected, skipping migrations."
  fi
  
  cd ../..
elif [ "$RENDER_SERVICE_NAME" = "book-finder-processor" ]; then
  echo "Building Processor..."
  pnpm turbo build --filter=processor
else
  echo "Building all services..."
  pnpm turbo build
fi 