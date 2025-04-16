# Build stage
FROM node:18-alpine as builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/notification-service/package*.json ./packages/notification-service/

# Install dependencies
RUN npm ci

# Copy source code
COPY packages/shared ./packages/shared
COPY packages/notification-service ./packages/notification-service

# Build
RUN npm run build --workspace=packages/notification-service

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/notification-service/package*.json ./packages/notification-service/

# Install production dependencies only
RUN npm ci --only=production

# Install curl for healthcheck
RUN apk --no-cache add curl

# Copy built files
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/notification-service/dist ./packages/notification-service/dist

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3003

# Expose port
EXPOSE 3003

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3003/ || exit 1

# Start the service
CMD ["node", "packages/notification-service/dist/index.js"] 