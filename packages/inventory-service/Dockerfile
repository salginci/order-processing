# Build stage
FROM node:18-alpine as builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY packages/inventory-service/package*.json ./packages/inventory-service/

# Install dependencies
RUN npm install

# Copy source code
COPY shared/ ./shared/
COPY packages/inventory-service/ ./packages/inventory-service/

# Build
RUN npm run build --workspace=packages/inventory-service

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY packages/inventory-service/package*.json ./packages/inventory-service/

# Install dependencies
RUN npm install

# Copy shared and built inventory service
COPY shared/ ./shared/
COPY --from=builder /app/packages/inventory-service/dist ./packages/inventory-service/dist

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Expose port
EXPOSE 8080

# Start the service
CMD ["node", "packages/inventory-service/dist/index.js"] 