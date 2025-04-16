# Build stage
FROM node:18-alpine as builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY packages/order-service/package*.json ./packages/order-service/

# Install dependencies
RUN npm install

# Copy source code
COPY shared/ ./shared/
COPY packages/order-service/ ./packages/order-service/

# Build
RUN npm run build --workspace=packages/order-service

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY packages/order-service/package*.json ./packages/order-service/

# Install dependencies
RUN npm install

# Copy shared and built order service
COPY shared/ ./shared/
COPY --from=builder /app/packages/order-service/dist ./packages/order-service/dist

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Expose port
EXPOSE 8080

# Start the service
CMD ["node", "packages/order-service/dist/index.js"] 