# Build stage
FROM node:18-alpine as builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/cart-service/package*.json ./packages/cart-service/

# Install dependencies
RUN npm ci

# Copy source code
COPY packages/shared ./packages/shared
COPY packages/cart-service ./packages/cart-service

# Build
RUN npm run build --workspace=packages/cart-service

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/cart-service/package*.json ./packages/cart-service/

# Install production dependencies only
RUN npm ci --only=production

# Copy built files
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/cart-service/dist ./packages/cart-service/dist

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Expose port
EXPOSE 8080

# Start the service
CMD ["node", "packages/cart-service/dist/index.js"] 