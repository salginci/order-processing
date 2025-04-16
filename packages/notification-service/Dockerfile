# Build stage
FROM node:18-alpine as builder

WORKDIR /app

# Copy root package.json and workspace files
COPY package*.json .
COPY package-lock.json .

# Create necessary directories
RUN mkdir -p shared/config shared/entities shared/types shared/utils packages/notification-service

# Copy package.json files for workspace packages
COPY shared/package*.json shared/
COPY packages/notification-service/package*.json packages/notification-service/

# Install dependencies
RUN npm install

# Copy shared code and TypeScript configs
COPY shared/config/ shared/config/
COPY shared/entities/ shared/entities/
COPY shared/types/ shared/types/
COPY shared/utils/ shared/utils/
COPY packages/notification-service/tsconfig.json packages/notification-service/
COPY packages/notification-service/src/ packages/notification-service/src/

# Build
RUN npm run build --workspace=packages/notification-service

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy root package.json and workspace files
COPY package*.json .
COPY package-lock.json .

# Create necessary directories
RUN mkdir -p shared/config shared/entities shared/types shared/utils packages/notification-service

# Copy package.json files for workspace packages
COPY shared/package*.json shared/
COPY packages/notification-service/package*.json packages/notification-service/

# Install dependencies
RUN npm install

# Install curl for healthcheck
RUN apk --no-cache add curl

# Copy built files
COPY --from=builder /app/shared/dist shared/dist
COPY --from=builder /app/packages/notification-service/dist packages/notification-service/dist

# Set environment variables
ENV PORT=3003

# Expose port
EXPOSE 3003

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3003/ || exit 1

# Start the service
CMD ["node", "packages/notification-service/dist/index.js"] 