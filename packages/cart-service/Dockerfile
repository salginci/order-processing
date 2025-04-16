# Build stage
FROM node:18-alpine as builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY packages/cart-service/package*.json ./packages/cart-service/

# Install dependencies
RUN npm install

# Copy source code
COPY shared ./shared
COPY packages/cart-service ./packages/cart-service

# Build
RUN npm run build --workspace=packages/cart-service

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY packages/cart-service/package*.json ./packages/cart-service/

# Install dependencies
RUN npm install

# Copy built files
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/packages/cart-service/dist ./packages/cart-service/dist

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Expose port
EXPOSE 8080

# Start the service
CMD ["node", "packages/cart-service/dist/index.js"] 