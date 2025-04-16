# E-commerce Microservices Platform

A scalable e-commerce platform built with microservices architecture, featuring:
- Product Management
- Order Processing
- Inventory Management
- Customer Management
- Notification System
- Email Service
- Cart Service

## Project Architecture

This project is built using a monorepo architecture, where all microservices are managed in a single repository. We chose this approach for several key benefits:

1. **Unified Development Experience**
   - Single repository for all services
   - Shared configuration and tooling
   - Consistent coding standards across services
   - Simplified dependency management

2. **Code Reusability**
   - Shared types and interfaces
   - Common utilities and helpers
   - Consistent error handling
   - Shared testing infrastructure

3. **Simplified Deployment**
   - Coordinated versioning
   - Atomic commits across services
   - Easier dependency management
   - Simplified CI/CD pipeline setup

4. **Better Collaboration**
   - Single source of truth
   - Easier code review process
   - Simplified onboarding for new developers
   - Better visibility across the entire system

5. **Development Efficiency**
   - Faster local development setup
   - Easier cross-service debugging
   - Simplified dependency updates
   - Better tooling support

## Assumptions

1. **Authentication**
   - User authentication is handled externally
   - All API requests include a valid user token
   - Customer IDs are provided in the request headers
   - The following customer IDs are predefined for testing:
     - `550e8400-e29b-41d4-a716-446655440000` - John Smith
     - `550e8400-e29b-41d4-a716-446655440001` - Jane Doe
     - `550e8400-e29b-41d4-a716-446655440002` - Robert Johnson
     - `550e8400-e29b-41d4-a716-446655440003` - Emily Davis
     - `550e8400-e29b-41d4-a716-446655440004` - Michael Wilson

2. **Data Consistency**
   - Product SKUs are unique across the system
   - Customer IDs are UUIDs
   - All timestamps are in UTC

3. **Service Dependencies**
   - PostgreSQL is available and accessible
   - Google Cloud Pub/Sub is configured
   - All services can communicate with each other

4. **Cart Service Specific**
   - Each customer has at most one active cart
   - Cart is automatically created when first item is added
   - Cart items include product SKU and quantity
   - Cart has a `cart_locked` flag that becomes true when an order is created
   - Cart operations require a valid customer ID in the request header
   - Cart is associated with a customer ID

## API Endpoints

### Product Service (Port: 3001)
- `GET /products` - List all products
- `GET /products/:sku` - Get product by SKU
- `POST /products` - Create new product
- `PUT /products/:sku` - Update product
- `DELETE /products/:sku` - Delete product
- `GET /` - Health check

### Order Service (Port: 3000)
- `GET /orders` - List all orders
- `GET /orders/:id` - Get order by ID
- `POST /orders` - Create new order
- `PUT /orders/:id` - Update order
- `DELETE /orders/:id` - Delete order
- `GET /` - Health check

### Inventory Service (Port: 3002)
- `GET /inventory` - List all inventory items
- `GET /inventory/:sku` - Get inventory item by SKU
- `POST /inventory` - Create new inventory item
- `PUT /inventory/:sku` - Update inventory item
- `DELETE /inventory/:sku` - Delete inventory item
- `GET /` - Health check

### Customer Service (Port: 3006)
- `GET /` - Health check
- `GET /customers` - List all customers
- `POST /customers` - Create new customer
- `GET /customers/:id` - Get customer by ID
- `PUT /customers/:id` - Update customer
- `DELETE /customers/:id` - Delete customer

### Notification Service (Port: 3003)
- `GET /notifications` - List all notifications
- `GET /notifications/:id` - Get notification by ID
- `POST /notifications` - Create new notification
- `GET /` - Health check

### Email Service (Port: 3004)
- `GET /` - Health check

### Cart Service (Port: 3005)
- `GET /` - Health check
- `POST /cart/items` - Add product to cart (creates cart if not exists)
- `DELETE /cart/items/:product_sku` - Remove item from cart
- `GET /cart` - Get current cart details
- `POST /cart/convert-to-order` - Convert cart to order (locks cart and publishes order-requested event)

## Events

### Order Requested Event
- **Topic**: `order-requested`
- **Published by**: Cart Service
- **Subscribed by**: Inventory Service
- **Payload**:
  ```typescript
  {
    cart_id: string;
    customer_id: string;
    items: Array<{
      product_sku: string;
      quantity: number;
    }>;
  }
  ```

### Stock Rejected Event
- **Topic**: `stock.rejected`
- **Published by**: Inventory Service
- **Subscribed by**: Cart Service, Notification Service
- **Payload**:
  ```typescript
  {
    cart_id: string;
    customer_id: string;
    reason: 'insufficient_stock';
    details: Array<{
      product_sku: string;
      requested: number;
      available: number;
    }>;
  }
  ```

## Event Flow

| Event Name | Published By | Subscribed By | Description |
|------------|-------------|---------------|-------------|
| `order-requested` | Cart Service | Inventory Service | Triggered when a cart is converted to order. Contains cart and item details. |
| `stock.rejected` | Inventory Service | Cart Service, Notification Service, Push Service | Published when inventory check fails. Updates cart status and notifies user. |
| `stock-available` | Inventory Service | Order Service | Published when inventory is sufficient. Triggers order creation. |
| `order.created` | Order Service | Notification Service, Email Service, Push Service | Published when an order is created. Triggers notifications. |
| `order.cancelled` | Order Service | Notification Service, Email Service, Push Service | Published when an order is cancelled. Triggers notifications. |

## Services

The platform consists of the following services:

### Core Services
- Order Service
- Inventory Service
- Notification Service

### Additional Services
- Product Service (Product catalog management)
- Email Service (Order notifications)
- Cart Service (Shopping cart management)
- Customer Service (Basic user management)
  - User authentication (assumed to be handled externally)
  - User profile management
  - Basic user operations

## Development

To start all services locally:

```bash
npm run dev
```

## Deployment

The services are deployed using GitHub Actions.

## Documentation

Service-specific documentation will be added as we refactor each service.

## Service Communication

### API Endpoints

| Service | Port | Endpoints |
|---------|------|-----------|
| Product Service | 3001 | `GET /products`, `GET /products/:sku`, `POST /products`, `PUT /products/:sku`, `DELETE /products/:sku`, `GET /` |
| Order Service | 3000 | `GET /orders`, `GET /orders/:id`, `POST /orders`, `PUT /orders/:id`, `DELETE /orders/:id`, `GET /` |
| Inventory Service | 3002 | `GET /inventory`, `GET /inventory/:sku`, `POST /inventory`, `PUT /inventory/:sku`, `DELETE /inventory/:sku`, `GET /` |
| Customer Service | 3006 | `GET /customers`, `POST /customers`, `GET /customers/:id`, `PUT /customers/:id`, `DELETE /customers/:id`, `GET /` |
| Notification Service | 3002 | `GET /` |
| Email Service | 3004 | `GET /` |
| Push Service | 3007 | `GET /`, `GET /notifications/:customerId` |
| Cart Service | 3005 | `GET /`, `POST /cart/items`, `DELETE /cart/items/:product_sku`, `GET /cart`, `POST /cart/convert-to-order` |

### Event Flow

| Event Name | Published By | Subscribed By | Description |
|------------|-------------|---------------|-------------|
| `order-requested` | Cart Service | Inventory Service | Triggered when a cart is converted to order. Contains cart and item details. |
| `stock.rejected` | Inventory Service | Cart Service, Notification Service | Published when inventory check fails. Updates cart status and notifies user. |
| `stock-available` | Inventory Service | Order Service | Published when inventory is sufficient. Triggers order creation. |
| `order.created` | Order Service | Notification Service | Published when an order is created. Triggers notifications. |
| `order.cancelled` | Order Service | Notification Service | Published when an order is cancelled. Triggers notifications. |

### Notification Flow

| Event | Source Service | Notification Service Action |
|-------|---------------|----------------------------|
| `order.created` | Order Service | Creates both email and push notifications for order confirmation |
| `order.cancelled` | Order Service | Creates both email and push notifications for order cancellation |
| `stock.rejected` | Inventory Service | Creates both email and push notifications for stock unavailability | 