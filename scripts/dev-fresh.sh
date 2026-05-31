#!/bin/bash
# dev-fresh: start orchestrator first to create Kafka topics, then start all services.
# Use this after wiping Kafka data (docker compose down -v) or on first run.

set -e

echo "Building orchestrator-service..."
pnpm --filter orchestrator-service exec nest build

echo "Starting orchestrator to create Kafka topics..."
node apps/orchestrator-service/dist/main.js &
ORC_PID=$!

echo "Waiting 25 seconds for all topics to be created..."
sleep 25

echo "Stopping temporary orchestrator..."
kill $ORC_PID 2>/dev/null
wait $ORC_PID 2>/dev/null || true

echo "Starting all services..."
pnpm dev:services
