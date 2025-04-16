# Build stage
FROM node:18-alpine as builder

WORKDIR /app

# Copy root package.json and workspace files
COPY package*.json .
COPY package-lock.json .
COPY tsconfig.json .

# Create necessary directories
RUN mkdir -p shared/config shared/entities shared/types shared/utils packages/inventory-service

# Copy package.json files for workspace packages
COPY shared/package*.json shared/
COPY packages/inventory-service/package*.json packages/inventory-service/

# Install dependencies
RUN npm ci

# Copy shared code
COPY shared/config/ shared/config/
COPY shared/entities/ shared/entities/
COPY shared/types/ shared/types/
COPY shared/utils/ shared/utils/
COPY shared/tsconfig.json shared/
COPY packages/inventory-service/src/ packages/inventory-service/src/
COPY packages/inventory-service/tsconfig.json packages/inventory-service/

# Build
RUN npm run build --workspace=packages/inventory-service

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy root package.json and workspace files
COPY package*.json .
COPY package-lock.json .

# Create necessary directories
RUN mkdir -p shared/config shared/entities shared/types shared/utils packages/inventory-service

# Copy package.json files for workspace packages
COPY shared/package*.json shared/
COPY packages/inventory-service/package*.json packages/inventory-service/

# Install production dependencies only
RUN npm ci --only=production

# Install curl for healthcheck
RUN apk --no-cache add curl

# Copy built files
COPY --from=builder /app/shared/dist shared/dist
COPY --from=builder /app/packages/inventory-service/dist packages/inventory-service/dist

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3002

# Expose port
EXPOSE 3002

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3002/ || exit 1

# Start the service
CMD ["node", "packages/inventory-service/dist/index.js"] 