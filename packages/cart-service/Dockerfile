FROM Dockerfile.base

# Copy service source
COPY packages/cart-service ./packages/cart-service

# Build service
RUN cd packages/cart-service && npm install && npm run build

# Set working directory to service
WORKDIR /app/packages/cart-service

# Expose port 8080
EXPOSE 8080

# Start service
CMD ["node", "dist/index.js"] 