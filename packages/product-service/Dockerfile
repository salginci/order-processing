# Build stage
FROM node:18-alpine as builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY packages/product-service/package*.json ./packages/product-service/

# Install dependencies
RUN npm install

# Copy source code
COPY shared/ ./shared/
COPY packages/product-service/ ./packages/product-service/

# Build
RUN npm run build --workspace=packages/product-service

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY packages/product-service/package*.json ./packages/product-service/

# Install dependencies
RUN npm install

# Copy shared and built product service
COPY shared/ ./shared/
COPY --from=builder /app/packages/product-service/dist ./packages/product-service/dist

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Expose port
EXPOSE 8080

# Start the service
CMD ["node", "packages/product-service/dist/index.js"] 