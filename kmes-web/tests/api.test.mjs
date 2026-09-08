import assert from 'node:assert/strict';
const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
if (!base.startsWith('http://localhost:'))
  throw Error('集成测试只允许本地隔离数据库');
const read = async () => {
  const r = await fetch(base + '/api/warehouse');
  assert.equal(r.status, 200);
  return (await r.json()).state;
};
const call = async (action, payload, id = crypto.randomUUID()) => {
  const r = await fetch(base + '/api/warehouse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ action, payload, requestId: id }),
  });
  return { status: r.status, ...(await r.json()) };
};
const prefix = 'QA' + Date.now();
const initial = await read();
const initialTotal = initial.stocks.reduce((a, x) => a + x.qty, 0);
assert.equal(
  (
    await call('location', {
      id: prefix,
      zone: '验收测试仓',
      rack: prefix,
      level: '1',
      capacity: 100,
    })
  ).status,
  200,
);
const payload = {
  productId: initial.products[0].id,
  locationId: prefix,
  qty: 30,
  box: prefix,
  order: prefix,
  customer: prefix,
};
const req = crypto.randomUUID();
const registered = await call('register', payload, req);
assert.equal(registered.status, 200);
assert.equal((await call('register', payload, req)).status, 200);
assert.equal((await call('register', payload)).status, 400);
let persisted = await read();
const stock = persisted.stocks.find((x) => x.box === prefix);
assert.equal(stock.qty, 30);
assert.equal(
  persisted.stocks.reduce((a, x) => a + x.qty, 0),
  initialTotal + 30,
);
// Concurrent tasks contend for 30 pieces; only one 20-piece reservation may win.
const taskPayload = {
  lines: [{ id: stock.id, qty: 20 }],
  wave: prefix,
  outlet: 'OUT-01',
  reason: '订单发货',
};
const attempts = await Promise.all([
  call('createTask', taskPayload),
  call('createTask', taskPayload),
]);
assert.equal(attempts.filter((r) => r.status === 200).length, 1);
assert.equal(attempts.filter((r) => r.status === 400).length, 1);
const task = attempts.find((r) => r.status === 200).result;
assert.equal((await call('pick', { id: task })).status, 200);
assert.equal(
  (await call('verify', { id: task, checks: [{ barcode: 'WRONG', qty: 20 }] }))
    .status,
  400,
);
assert.equal(
  (
    await call('verify', {
      id: task,
      checks: [{ barcode: initial.products[0].barcode, qty: 20 }],
    })
  ).status,
  200,
);
persisted = await read();
assert.equal(persisted.stocks.find((x) => x.id === stock.id).qty, 10);
assert.equal(persisted.stocks.find((x) => x.id === stock.id).reserved, 0);
assert.equal(persisted.tasks.find((x) => x.id === task).status, '已完成');
assert.ok(
  persisted.events.some((e) => e.ref === task && e.action === '复核出库'),
);
const wrongOrigin = await fetch(base + '/api/warehouse', {
  method: 'POST',
  headers: {
    Origin: 'https://unrelated.invalid',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    action: 'draft',
    payload: {},
    requestId: crypto.randomUUID(),
  }),
});
assert.equal(wrongOrigin.status, 403);
console.log(
  'PASS: D1 persistence, idempotent registration, duplicate box rejection, concurrent reservation, barcode rejection, outbound completion, audit read-back, cross-origin rejection.',
);
