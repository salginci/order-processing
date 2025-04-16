#!/bin/bash

# Set your project ID
PROJECT_ID="your-project-id"

# Create topics
gcloud pubsub topics create order-requested
gcloud pubsub topics create inventory-status
gcloud pubsub topics create stock.rejected
gcloud pubsub topics create socket-message-stock-unavailable
gcloud pubsub topics create stock-available
gcloud pubsub topics create order.created
gcloud pubsub topics create order.cancelled

# Create subscriptions for order-requested topic
gcloud pubsub subscriptions create inventory-service-order-requested \
  --topic=order-requested \
  --ack-deadline=60

# Create subscriptions for inventory-status topic
gcloud pubsub subscriptions create order-service-inventory-status \
  --topic=inventory-status \
  --ack-deadline=60

# Create subscriptions for stock.rejected topic
gcloud pubsub subscriptions create cart-service-stock-rejected \
  --topic=stock.rejected \
  --ack-deadline=60

gcloud pubsub subscriptions create notification-service-stock-rejected \
  --topic=stock.rejected \
  --ack-deadline=60

gcloud pubsub subscriptions create push-service-stock-rejected \
  --topic=stock.rejected \
  --ack-deadline=60

# Create subscription for socket-message-stock-unavailable topic
gcloud pubsub subscriptions create socket-service-stock-unavailable \
  --topic=socket-message-stock-unavailable \
  --ack-deadline=60

# Create subscriptions for stock-available topic
gcloud pubsub subscriptions create cart-service-stock-available \
  --topic=stock-available \
  --ack-deadline=60

gcloud pubsub subscriptions create order-service-stock-available \
  --topic=stock-available \
  --ack-deadline=60

# Create subscriptions for order.created topic
gcloud pubsub subscriptions create notification-service-order-created \
  --topic=order.created \
  --ack-deadline=60

gcloud pubsub subscriptions create push-service-order-created \
  --topic=order.created \
  --ack-deadline=60

# Create subscriptions for order.cancelled topic
gcloud pubsub subscriptions create push-service-order-cancelled \
  --topic=order.cancelled \
  --ack-deadline=60

echo "Pub/Sub resources created successfully" 