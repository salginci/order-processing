# Build stage
FROM node:18-alpine as builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY packages/customer-service/package*.json ./packages/customer-service/

# Install dependencies
RUN npm install

# Copy source code
COPY shared/ ./shared/
COPY packages/customer-service/ ./packages/customer-service/

# Build
RUN npm run build --workspace=packages/customer-service

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY packages/customer-service/package*.json ./packages/customer-service/

# Install dependencies
RUN npm install

# Copy shared and built customer service
COPY shared/ ./shared/
COPY --from=builder /app/packages/customer-service/dist ./packages/customer-service/dist

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080
ENV DB_USER=postgres
ENV DB_PASSWORD=postgres
ENV DB_HOST=localhost
ENV DB_PORT=5432
ENV DB_NAME=customers

# Expose port
EXPOSE 8080

# Start the service
CMD ["node", "packages/customer-service/dist/index.js"] 