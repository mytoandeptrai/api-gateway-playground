#!/usr/bin/env node
/**
 * Stress test — NextMart payment & refund flows
 * Requirements: Node >= 18 (native fetch)
 *
 * Edit the CONFIG block below, then: node stress-test.js
 */

// ─── CONFIG — edit these before running ──────────────────────────────────────

const GATEWAY     = 'http://localhost:3002/api/v1/gateway';
const PAYMENT_SVC = 'http://localhost:3008/api/v1';
const REFUND_SVC  = 'http://localhost:3011/api/v1';

const N          = 5;                  // number of concurrent requests (case 1)
const PRODUCT_ID = '43ea70a6-eea3-463f-816b-f987b8dff6c2';                 // product UUID (required for case 1 & 2)
const QTY        = 40;                  // quantity per order
const RAW_TOKEN  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjEsImVtYWlsIjoidGVzdEBuZXh0bWFydC5jb20iLCJyb2xlIjoidXNlciIsImlhdCI6MTc4MDU4NTg2MCwiZXhwIjoxNzgwNTg2MTYwfQ.ToPnx3lS8l4HVFd4S_3QTUH49w_ZeNjimYYQr9jr72A';                 // JWT token (without "Bearer " prefix)
const ONLY_CASE  = 1;               // run only one case: 1 | 2 | 3, or null for all

// ─────────────────────────────────────────────────────────────────────────────

const TOKEN = `Bearer ${RAW_TOKEN}`;

// ─── helpers ─────────────────────────────────────────────────────────────────

const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  gray:   '\x1b[90m',
};

const ok   = (msg) => console.log(`  ${c.green}✓${c.reset} ${msg}`);
const fail = (msg) => console.log(`  ${c.red}✗${c.reset} ${msg}`);
const info = (msg) => console.log(`  ${c.gray}→${c.reset} ${msg}`);
const warn = (msg) => console.log(`  ${c.yellow}!${c.reset} ${msg}`);

function header(title) {
  console.log(`\n${c.bold}${c.cyan}${'─'.repeat(60)}${c.reset}`);
  console.log(`${c.bold}${c.cyan} ${title}${c.reset}`);
  console.log(`${c.bold}${c.cyan}${'─'.repeat(60)}${c.reset}`);
}

async function request(method, url, body, extraHeaders = {}) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: TOKEN,
      ...extraHeaders,
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  let data;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

async function poll(fn, { interval = 1500, timeout = 30_000, label = '' } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await fn();
    if (result !== null) return result;
    if (label) info(`  waiting for ${label}…`);
    await new Promise((r) => setTimeout(r, interval));
  }
  return null;
}

const SHIPPING_ADDRESS = {
  fullName: 'Stress Tester',
  phone: '0912345678',
  address: '123 Test Street',
  city: 'Ho Chi Minh City',
};

async function createOrder(productId, quantity) {
  return request('POST', `${GATEWAY}/orders`, {
    productId,
    quantity,
    shippingAddress: SHIPPING_ADDRESS,
  });
}

async function getPaymentStatus(orderId) {
  return request('GET', `${PAYMENT_SVC}/payment/${orderId}/status`);
}

async function simulatePaymentFailure(orderId, responseCode = '99') {
  return request('POST', `${PAYMENT_SVC}/payment/${orderId}/simulate-failure`, {
    responseCode,
  });
}

async function simulateRefundReject(orderId) {
  return request('POST', `${REFUND_SVC}/refund/${orderId}/simulate-reject`);
}

async function getOrderStatus(orderId) {
  return request('GET', `${GATEWAY}/orders/${orderId}`);
}

// ─── Case 1: concurrent orders → Redlock stress ──────────────────────────────

async function case1() {
  header(`Case 1 — Concurrent Orders × ${N} (Redlock stress)`);
  info(`productId=${PRODUCT_ID}  qty=${QTY}  parallel=${N}`);

  if (!PRODUCT_ID) { warn('PRODUCT_ID not set, skipping'); return; }
  if (!RAW_TOKEN)  { warn('TOKEN not set, skipping'); return; }

  const start = Date.now();

  const tasks = Array.from({ length: N }, (_, i) =>
    createOrder(PRODUCT_ID, QTY).then((r) => ({ i, ...r })),
  );

  const settled = await Promise.allSettled(tasks);
  const elapsed = Date.now() - start;

  let succeeded = 0, stockFail = 0, otherFail = 0;

  console.log();
  settled.forEach((s, i) => {
    const label = `[${i + 1}/${N}]`;
    if (s.status === 'rejected') {
      otherFail++;
      fail(`${label} network error  ${s.reason?.message ?? s.reason}`);
      return;
    }
    const { status, data } = s.value;
    if (status === 201) {
      succeeded++;
      ok(`${label} created  orderId=${data?.data?.id ?? data?.id ?? '?'}`);
    } else if (status === 400 || status === 409 || status === 422) {
      stockFail++;
      fail(`${label} ${status} (stock/validation)  ${JSON.stringify(data?.message ?? data).slice(0, 80)}`);
    } else {
      otherFail++;
      fail(`${label} ${status} (unexpected)  ${JSON.stringify(data?.message ?? data).slice(0, 80)}`);
    }
  });

  console.log();
  info(`${succeeded}/${N} created  |  ${stockFail} stock/validation failures  |  ${otherFail} unexpected errors  |  ${elapsed}ms total`);

  if (succeeded > 0 && otherFail === 0) {
    ok(`Redlock serialized ${N} concurrent requests without data race`);
  } else if (otherFail > 0) {
    fail(`${otherFail} unexpected errors — check service logs`);
  }
}

// ─── Case 2: payment failed → compensation flow ──────────────────────────────

async function case2() {
  header('Case 2 — Payment Failed → Compensation');
  info(`productId=${PRODUCT_ID}  qty=${QTY}`);

  if (!PRODUCT_ID) { warn('PRODUCT_ID not set, skipping'); return; }
  if (!RAW_TOKEN)  { warn('TOKEN not set, skipping'); return; }

  // Step 1: create order
  info('Creating order…');
  const { status: s1, data: d1 } = await createOrder(PRODUCT_ID, QTY);
  if (s1 !== 201) {
    fail(`Order creation failed ${s1}: ${JSON.stringify(d1?.message ?? d1).slice(0, 120)}`);
    return;
  }
  const orderId = d1?.data?.id ?? d1?.id;
  ok(`Order created  orderId=${orderId}`);

  // Step 2: poll until payment QR is ready (saga reached AWAIT_PAYMENT)
  info('Waiting for payment QR (saga → AWAIT_PAYMENT)…');
  const payment = await poll(
    async () => {
      const { data } = await getPaymentStatus(orderId);
      return data?.qrUrl ? data : null;
    },
    { timeout: 30_000, label: 'payment QR' },
  );

  if (!payment) {
    fail('Timed out waiting for payment QR — check orchestrator / inventory logs');
    return;
  }
  ok(`Payment QR ready  status=${payment.status}`);

  // Step 3: simulate failure
  info('Simulating payment failure (responseCode=24 — user cancelled)…');
  const { status: s3, data: d3 } = await simulatePaymentFailure(orderId, '24');
  if (s3 !== 200 && s3 !== 201) {
    fail(`simulate-failure returned ${s3}: ${JSON.stringify(d3).slice(0, 120)}`);
    return;
  }
  ok(`Payment failure injected  code=${d3?.responseCode}`);

  // Step 4: poll order status → expect CANCELLED
  info('Waiting for order to be CANCELLED (compensation flow)…');
  const finalOrder = await poll(
    async () => {
      const { data } = await getOrderStatus(orderId);
      const status = data?.data?.status ?? data?.status;
      return status === 'CANCELLED' ? data : null;
    },
    { timeout: 30_000, label: 'CANCELLED status' },
  );

  if (!finalOrder) {
    warn('Order not yet CANCELLED within 30s — saga may still be compensating');
    info('Check orchestrator logs: inventory.release_stock → order.cancel');
  } else {
    ok('Order status = CANCELLED  ✓  Compensation flow completed');
  }
}

// ─── Case 3: refund rejected → simulate-reject endpoint ─────────────────────

async function case3() {
  header('Case 3 — Refund Rejected (simulate-reject)');

  // Generate a fake orderId — simulate-reject bypasses order/delivery checks
  const fakeOrderId = crypto.randomUUID();
  info(`Using synthetic orderId=${fakeOrderId}`);

  // Step 1: trigger simulate-reject
  info('Calling simulate-reject…');
  const { status: s1, data: d1 } = await simulateRefundReject(fakeOrderId);
  if (s1 !== 200 && s1 !== 201) {
    fail(`simulate-reject returned ${s1}: ${JSON.stringify(d1).slice(0, 120)}`);
    return;
  }
  const refundId = d1?.refundId ?? d1?.data?.refundId;
  ok(`Refund request created  refundId=${refundId}  reason="${d1?.reason}"`);
  info('Outbox will publish refund.requested → refund consumer calls validateAndEmit');
  info('reason.length < 20 → auto-reject → refund.validated { approved: false }');

  // Step 2: poll refund status → expect REFUND_REJECTED
  info('Polling refund status…');
  const finalRefund = await poll(
    async () => {
      const { data } = await request('GET', `${REFUND_SVC}/refund/${fakeOrderId}/status`);
      const status = data?.data?.status ?? data?.status;
      return status === 'REFUND_REJECTED' ? data : null;
    },
    { timeout: 30_000, label: 'REFUND_REJECTED status' },
  );

  if (!finalRefund) {
    warn('Refund not REFUND_REJECTED within 30s');
    info('Verify: outbox worker running, refund consumer active, orchestrator logs');
  } else {
    ok(`Refund status = REFUND_REJECTED  reviewNote="${finalRefund?.data?.reviewNote ?? finalRefund?.reviewNote}"  ✓`);
  }
}

// ─── runner ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${c.bold}NextMart Stress Test${c.reset}`);
  console.log(`${c.gray}gateway=${GATEWAY}  payment=${PAYMENT_SVC}  refund=${REFUND_SVC}${c.reset}`);

  if (!RAW_TOKEN && ONLY_CASE !== 3) {
    warn('TOKEN env var is empty — requests requiring auth will fail\n');
  }

  const cases = { 1: case1, 2: case2, 3: case3 };

  if (ONLY_CASE) {
    if (!cases[ONLY_CASE]) {
      fail(`Unknown case: ${ONLY_CASE}. Valid: 1 | 2 | 3`);
      process.exit(1);
    }
    await cases[ONLY_CASE]();
  } else {
    await case1();
    await case2();
    await case3();
  }

  console.log(`\n${c.bold}${c.cyan}${'─'.repeat(60)}${c.reset}`);
  console.log(`${c.bold} Done${c.reset}\n`);
}

main().catch((err) => {
  console.error(`\n${c.red}Fatal:${c.reset}`, err.message);
  process.exit(1);
});
