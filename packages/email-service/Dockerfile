# Build stage
FROM node:18-alpine as builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY packages/email-service/package*.json ./packages/email-service/

# Install dependencies
RUN npm install

# Copy source code
COPY shared/ ./shared/
COPY packages/email-service/ ./packages/email-service/

# Build
RUN npm run build --workspace=packages/email-service

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY packages/email-service/package*.json ./packages/email-service/

# Install dependencies
RUN npm install

# Copy shared and built email service
COPY shared/ ./shared/
COPY --from=builder /app/packages/email-service/dist ./packages/email-service/dist

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Expose port
EXPOSE 8080

# Start the service
CMD ["node", "packages/email-service/dist/index.js"] 