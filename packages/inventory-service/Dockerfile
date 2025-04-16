# Build stage
FROM node:18-alpine as builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/inventory-service/package*.json ./packages/inventory-service/

# Install dependencies
RUN npm ci

# Copy source code
COPY packages/shared ./packages/shared
COPY packages/inventory-service ./packages/inventory-service

# Build
RUN npm run build --workspace=packages/inventory-service

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/inventory-service/package*.json ./packages/inventory-service/

# Install production dependencies only
RUN npm ci --only=production

# Install curl for healthcheck
RUN apk --no-cache add curl

# Copy built files
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/inventory-service/dist ./packages/inventory-service/dist

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