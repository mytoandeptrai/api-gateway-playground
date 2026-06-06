/**
 * Usage:
 *   MESSAGE_COUNT=30 INTERVAL_MS=300 node producer.js
 *
 * Env vars:
 *   MESSAGE_COUNT   — number of messages to send (default: 30)
 *   INTERVAL_MS     — delay between messages in ms (default: 500)
 *   BURST           — send all messages without delay ("true"/"false")
 *   SKEW            — all messages use same key → all go to same partition ("true"/"false")
 *   INJECT_POISON   — inject one poison pill message at position 50% ("true"/"false")
 *   POISON_KEY      — key to use for the poison pill message (default: "order-POISON")
 */
const { Kafka } = require('kafkajs');

const TOPIC = 'lab.orders';
const MESSAGE_COUNT = parseInt(process.env.MESSAGE_COUNT || '30');
const INTERVAL_MS = parseInt(process.env.INTERVAL_MS || '500');
const BURST = process.env.BURST === 'true';
const SKEW = process.env.SKEW === 'true';
const INJECT_POISON = process.env.INJECT_POISON === 'true';
const POISON_KEY = process.env.POISON_KEY || 'order-POISON';

const kafka = new Kafka({
  clientId: 'lab-producer',
  brokers: ['localhost:1115'],
  logLevel: 1,
});

const producer = kafka.producer();

const ORDER_IDS = ['order-A', 'order-B', 'order-C', 'order-D', 'order-E', 'order-F'];

// Scenario 9: Partition Skew — force all messages to same key → same partition
const getKey = (i) => (SKEW ? 'order-A' : ORDER_IDS[i % ORDER_IDS.length]);

async function run() {
  await producer.connect();
  console.log(
    `[Producer] Connected. Sending ${MESSAGE_COUNT} messages` +
      ` (interval=${BURST ? 'burst' : INTERVAL_MS + 'ms'}` +
      (SKEW ? ', SKEW=true' : '') +
      (INJECT_POISON ? `, INJECT_POISON key=${POISON_KEY}` : '') +
      ')\n',
  );

  const poisonAt = Math.floor(MESSAGE_COUNT / 2);

  for (let i = 0; i < MESSAGE_COUNT; i++) {
    // Inject one poison pill message at midpoint
    if (INJECT_POISON && i === poisonAt) {
      const meta = await producer.send({
        topic: TOPIC,
        messages: [{
          key: POISON_KEY,
          value: JSON.stringify({ orderId: POISON_KEY, seq: i + 1, total: MESSAGE_COUNT, type: 'POISON', sentAt: new Date().toISOString() }),
        }],
      });
      console.log(`[Producer] #${String(i + 1).padStart(3)} key=${POISON_KEY.padEnd(13)} → partition=${meta[0].partition} ☠️  POISON`);

      if (!BURST) await new Promise((r) => setTimeout(r, INTERVAL_MS));
      continue;
    }

    const key = getKey(i);
    const meta = await producer.send({
      topic: TOPIC,
      messages: [{
        key,
        value: JSON.stringify({ orderId: key, seq: i + 1, total: MESSAGE_COUNT, sentAt: new Date().toISOString() }),
      }],
    });
    const partition = meta[0].partition;
    console.log(
      `[Producer] #${String(i + 1).padStart(3)} key=${key.padEnd(13)} → partition=${partition}` +
        (SKEW && i > 0 ? ' (skew)' : ''),
    );

    if (!BURST) await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }

  await producer.disconnect();
  console.log('\n[Producer] Done.');
}

run().catch((err) => {
  console.error('[Producer] Error:', err.message);
  process.exit(1);
});
