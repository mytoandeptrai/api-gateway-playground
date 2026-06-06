/**
 * Usage:
 *   CONSUMER_ID=1 node consumer.js
 *   CONSUMER_ID=2 DELAY_MS=3000 node consumer.js
 *   CONSUMER_ID=3 GROUP_ID=lab-group-2 node consumer.js
 *
 * Env vars:
 *   CONSUMER_ID     — label for log output (default: "1")
 *   GROUP_ID        — consumer group (default: "lab-group")
 *   DELAY_MS        — simulate slow processing in ms (default: 0)
 *   POISON_KEY      — messages with this key always fail, offset never commits (default: off)
 *   CRASH_AFTER_N   — exit WITHOUT committing after processing N messages (default: 0 = off)
 */
const { Kafka } = require('kafkajs');

const CONSUMER_ID = process.env.CONSUMER_ID || '1';
const GROUP_ID = process.env.GROUP_ID || 'lab-group';
const DELAY_MS = parseInt(process.env.DELAY_MS || '0');
const POISON_KEY = process.env.POISON_KEY || null;
const CRASH_AFTER_N = parseInt(process.env.CRASH_AFTER_N || '0');
const TOPIC = 'lab.orders';

const label = `[C${CONSUMER_ID}]`;
let processedCount = 0;

const kafka = new Kafka({
  clientId: `lab-consumer-${CONSUMER_ID}`,
  brokers: ['localhost:1115'],
  logLevel: 1,
});

const consumer = kafka.consumer({
  groupId: GROUP_ID,
  sessionTimeout: 10000,
  heartbeatInterval: 2000,
});

async function run() {
  await consumer.connect();
  console.log(
    `${label} Connected | group=${GROUP_ID} | delay=${DELAY_MS}ms` +
      (POISON_KEY ? ` | poison_key=${POISON_KEY}` : '') +
      (CRASH_AFTER_N > 0 ? ` | crash_after=${CRASH_AFTER_N}` : ''),
  );

  consumer.on(consumer.events.GROUP_JOIN, (event) => {
    const assignment = event.payload.memberAssignment;
    const partitions = Object.entries(assignment)
      .map(([topic, parts]) => `${topic}:[${parts.join(',')}]`)
      .join(' ');
    console.log(`\n${label} ✅ REBALANCE DONE — assigned: ${partitions}\n`);
  });

  consumer.on(consumer.events.REBALANCING, () => {
    console.log(`\n${label} 🔄 REBALANCING in progress...\n`);
  });

  await consumer.subscribe({ topic: TOPIC, fromBeginning: false });

  await consumer.run({
    autoCommit: false,
    eachMessage: async ({ topic, partition, message }) => {
      const key = message.key?.toString() ?? null;
      const value = JSON.parse(message.value.toString());

      console.log(
        `${label} partition=${partition} offset=${message.offset} ` +
          `key=${String(key).padEnd(13)} seq=${String(value.seq).padStart(3)}/${value.total}` +
          (DELAY_MS > 0 ? ` [processing ${DELAY_MS}ms...]` : ''),
      );

      // --- Scenario 7: Poison Pill ---
      // Message with matching key always throws → offset never commits → partition lag grows.
      // Simulates a bad message that blocks a partition without DLQ.
      if (POISON_KEY && key === POISON_KEY) {
        console.error(
          `${label} ☠️  POISON PILL — key=${key} partition=${partition} offset=${message.offset} — skipping commit`,
        );
        throw new Error(`Poison pill: ${key}`);
      }

      try {
        if (DELAY_MS > 0) {
          await new Promise((r) => setTimeout(r, DELAY_MS));
        }

        processedCount++;

        // --- Scenario 8: Duplicate Processing ---
        // Exit BEFORE committing after N messages → on restart, last message re-delivered.
        // Simulates process crash between processing and commit (at-least-once delivery).
        if (CRASH_AFTER_N > 0 && processedCount >= CRASH_AFTER_N) {
          console.log(
            `${label} 💥 CRASH_BEFORE_COMMIT — processed ${processedCount} messages, ` +
              `exiting without committing partition=${partition} offset=${message.offset}`,
          );
          process.exit(1);
        }

        await consumer.commitOffsets([
          { topic, partition, offset: (Number(message.offset) + 1).toString() },
        ]);

        if (DELAY_MS > 0) {
          console.log(`${label} ✓ committed partition=${partition} offset=${message.offset}`);
        }
      } catch (error) {
        if (error.message?.startsWith('Poison pill')) throw error;
        console.error(
          `${label} ✗ Handler failed — skipping commit partition=${partition} offset=${message.offset}`,
          error.message,
        );
      }
    },
  });
}

run().catch((err) => {
  console.error(`${label} Error:`, err.message);
  process.exit(1);
});

process.on('SIGINT', async () => {
  console.log(`\n${label} Shutting down (SIGINT — graceful)...`);
  await consumer.disconnect();
  console.log(`${label} Disconnected. Broker notified → rebalance triggers immediately.`);
  process.exit(0);
});

// Scenario 10: Ungraceful shutdown simulation
// Run: kill -9 <PID> from another terminal
// Broker does NOT receive LeaveGroup → waits sessionTimeout (10s) before rebalancing
