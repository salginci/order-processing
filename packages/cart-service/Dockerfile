# Build stage
FROM node:18-alpine as builder

WORKDIR /app

# Copy root package.json and workspace files
COPY package*.json .
COPY package-lock.json .

# Create necessary directories
RUN mkdir -p shared/config shared/entities shared/types shared/utils packages/cart-service

# Copy package.json files for workspace packages
COPY shared/package*.json shared/
COPY packages/cart-service/package*.json packages/cart-service/

# Install dependencies
RUN npm install

# Copy shared code and TypeScript configs
COPY shared/config/ shared/config/
COPY shared/entities/ shared/entities/
COPY shared/types/ shared/types/
COPY shared/utils/ shared/utils/
COPY packages/cart-service/tsconfig.json packages/cart-service/
COPY packages/cart-service/src/ packages/cart-service/src/

# Build service
RUN npm run build --workspace=packages/cart-service

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy root package.json and workspace files
COPY package*.json .
COPY package-lock.json .

# Create necessary directories
RUN mkdir -p shared/config shared/entities shared/types shared/utils packages/cart-service

# Copy package.json files for workspace packages
COPY shared/package*.json shared/
COPY packages/cart-service/package*.json packages/cart-service/

# Install dependencies
RUN npm install

# Install curl for healthcheck
RUN apk --no-cache add curl

# Copy shared code
COPY shared/ shared/

# Copy built files
COPY --from=builder /app/packages/cart-service/dist packages/cart-service/dist

# Set environment variables
ENV PORT=3000

# Expose port
EXPOSE 3000

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1

# Start the service
CMD ["node", "packages/cart-service/dist/index.js"] 