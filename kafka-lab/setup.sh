#!/bin/bash
# Usage: ./setup.sh [partitions]
# Example: ./setup.sh 3

PARTITIONS=${1:-3}
TOPIC="lab.orders"
CONTAINER="api-gateway-kafka"

echo "Creating topic '$TOPIC' with $PARTITIONS partitions..."

docker exec $CONTAINER kafka-topics \
  --bootstrap-server kafka:29092 \
  --create \
  --topic $TOPIC \
  --partitions $PARTITIONS \
  --replication-factor 1 \
  --if-not-exists

echo ""
echo "Topic info:"
docker exec $CONTAINER kafka-topics \
  --bootstrap-server kafka:29092 \
  --describe \
  --topic $TOPIC
