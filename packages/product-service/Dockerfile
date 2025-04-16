FROM Dockerfile.base

# Copy service source
COPY packages/product-service ./packages/product-service

# Build service
RUN cd packages/product-service && npm install && npm run build

# Set working directory to service
WORKDIR /app/packages/product-service

# Expose port 8080
EXPOSE 8080

# Start service
CMD ["node", "dist/index.js"] 