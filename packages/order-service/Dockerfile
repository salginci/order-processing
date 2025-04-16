# Build stage
FROM node:18-alpine as builder

WORKDIR /app

# Copy root package.json and workspace files
COPY package*.json .
COPY package-lock.json .

# Create necessary directories
RUN mkdir -p shared/config shared/entities shared/types shared/utils packages/order-service

# Copy package.json files for workspace packages
COPY shared/package*.json shared/
COPY packages/order-service/package*.json packages/order-service/

# Install dependencies
RUN npm ci

# Copy shared code
COPY shared/config/ shared/config/
COPY shared/entities/ shared/entities/
COPY shared/types/ shared/types/
COPY shared/utils/ shared/utils/
COPY packages/order-service/src/ packages/order-service/src/

# Build
RUN npm run build --workspace=packages/order-service

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy root package.json and workspace files
COPY package*.json .
COPY package-lock.json .

# Create necessary directories
RUN mkdir -p shared/config shared/entities shared/types shared/utils packages/order-service

# Copy package.json files for workspace packages
COPY shared/package*.json shared/
COPY packages/order-service/package*.json packages/order-service/

# Install production dependencies only
RUN npm ci --only=production

# Install curl for healthcheck
RUN apk --no-cache add curl

# Copy built files
COPY --from=builder /app/shared/dist shared/dist
COPY --from=builder /app/packages/order-service/dist packages/order-service/dist

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001

# Expose port
EXPOSE 3001

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/ || exit 1

# Start the service
CMD ["node", "packages/order-service/dist/index.js"] 