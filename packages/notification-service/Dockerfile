# Build stage
FROM node:18-alpine as builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY packages/notification-service/package*.json ./packages/notification-service/

# Install dependencies
RUN npm install

# Copy source code
COPY shared/ ./shared/
COPY packages/notification-service/ ./packages/notification-service/

# Build
RUN npm run build --workspace=packages/notification-service

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY packages/notification-service/package*.json ./packages/notification-service/

# Install dependencies
RUN npm install

# Copy shared and built notification service
COPY shared/ ./shared/
COPY --from=builder /app/packages/notification-service/dist ./packages/notification-service/dist

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Expose port
EXPOSE 8080

# Start the service
CMD ["node", "packages/notification-service/dist/index.js"] 