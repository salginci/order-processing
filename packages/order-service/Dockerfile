# Build stage
FROM node:18-alpine as builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/order-service/package*.json ./packages/order-service/

# Install dependencies
RUN npm ci

# Copy source code
COPY packages/shared ./packages/shared
COPY packages/order-service ./packages/order-service

# Build
RUN npm run build --workspace=packages/order-service

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/order-service/package*.json ./packages/order-service/

# Install production dependencies only
RUN npm ci --only=production

# Copy built files
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/order-service/dist ./packages/order-service/dist

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Start the service
CMD ["node", "packages/order-service/dist/index.js"] 