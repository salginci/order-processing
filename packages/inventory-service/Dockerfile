# Build stage
FROM node:18-alpine as builder

WORKDIR /app

# Copy root package.json and workspace files
COPY package*.json .
COPY package-lock.json .

# Create necessary directories
RUN mkdir -p shared/config shared/entities shared/types shared/utils packages/inventory-service

# Copy package.json files for workspace packages
COPY shared/package*.json shared/
COPY packages/inventory-service/package*.json packages/inventory-service/

# Install dependencies
RUN npm install

# Copy shared code and TypeScript configs
COPY shared/config/ shared/config/
COPY shared/entities/ shared/entities/
COPY shared/types/ shared/types/
COPY shared/utils/ shared/utils/
COPY packages/inventory-service/tsconfig.json packages/inventory-service/
COPY packages/inventory-service/src/ packages/inventory-service/src/

# Build service
RUN npm run build --workspace=packages/inventory-service

# Production stage
FROM node:18-alpine

WORKDIR /app

# Define build arguments
ARG DB_HOST
ARG DB_PORT
ARG DB_USER
ARG DB_PASSWORD
ARG DB_NAME
ARG NODE_ENV

# Set environment variables
ENV DB_HOST=${DB_HOST}
ENV DB_PORT=${DB_PORT}
ENV DB_USER=${DB_USER}
ENV DB_PASSWORD=${DB_PASSWORD}
ENV DB_NAME=${DB_NAME}
ENV NODE_ENV=${NODE_ENV}
ENV PORT=3002

# Copy root package.json and workspace files
COPY package*.json .
COPY package-lock.json .

# Create necessary directories
RUN mkdir -p shared/config shared/entities shared/types shared/utils packages/inventory-service

# Copy package.json files for workspace packages
COPY shared/package*.json shared/
COPY packages/inventory-service/package*.json packages/inventory-service/

# Install dependencies
RUN npm install

# Install curl for healthcheck
RUN apk --no-cache add curl

# Copy shared code
COPY shared/ shared/

# Copy built files
COPY --from=builder /app/packages/inventory-service/dist packages/inventory-service/dist

# Expose port
EXPOSE 3002

# Add healthcheck with increased timeout
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:3002/health || exit 1

# Start the service
CMD ["node", "packages/inventory-service/dist/index.js"] 