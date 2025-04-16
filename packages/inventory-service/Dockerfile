FROM Dockerfile.base

# Copy service source
COPY packages/inventory-service ./packages/inventory-service

# Build service
RUN cd packages/inventory-service && npm install && npm run build

# Set working directory to service
WORKDIR /app/packages/inventory-service

# Expose port 8080
EXPOSE 8080

# Start service
CMD ["node", "dist/index.js"] 