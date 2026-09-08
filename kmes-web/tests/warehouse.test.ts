import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seed, mutate } from '../lib/warehouse.ts';
const total = (s: ReturnType<typeof seed>) =>
  s.stocks.reduce((a, x) => a + x.qty, 0);
const run = (
  s: ReturnType<typeof seed>,
  a: string,
  p: Record<string, unknown>,
  id = crypto.randomUUID(),
) => mutate(s, a, p, id);
test('登记增加库存，重复箱号、重复请求不会重复增加', () => {
  const s = seed(),
    p = {
      productId: 'SKU1',
      locationId: 'A01-02-03',
      qty: 20,
      box: 'TEST-BOX',
      order: 'TEST-ORDER',
      customer: 'TEST-CUSTOMER',
    },
    id = crypto.randomUUID();
  const r = run(s, 'register', p, id);
  assert.equal(total(r.state), total(s) + 20);
  assert.equal(r.state.events[0].action, '扫码登记');
  assert.deepEqual(run(r.state, 'register', p, id), r);
  assert.throws(() => run(r.state, 'register', p), /已登记/);
  assert.throws(() => run(r.state, 'register', { ...p, qty: 30 }, id), /冲突/);
});
test('单条和批量移位守恒，非法第二条导致整个操作不生效', () => {
  const s = seed();
  const p = {
    target: 'A01-02-03',
    lines: [
      { id: 'ST1', qty: 20 },
      { id: 'ST2', qty: 10 },
    ],
  };
  const r = run(s, 'move', p).state;
  assert.equal(total(s), total(r));
  assert.equal(r.stocks.find((x) => x.id === 'ST1')!.qty, 100);
  assert.equal(
    r.stocks
      .filter((x) => x.locationId === p.target)
      .reduce((a, x) => a + x.qty, 0),
    30,
  );
  const before = JSON.stringify(s);
  assert.throws(
    () =>
      run(s, 'move', { ...p, lines: [p.lines[0], { id: 'ST2', qty: 9999 }] }),
    /不足/,
  );
  assert.equal(JSON.stringify(s), before);
});
test('目标容量、异常库位、同源移位校验', () => {
  const s = seed();
  s.locations.find((l) => l.id === 'A01-02-03')!.capacity = 10;
  assert.throws(
    () =>
      run(s, 'move', { target: 'A01-02-03', lines: [{ id: 'ST1', qty: 11 }] }),
    /容量/,
  );
  assert.throws(
    () =>
      run(s, 'move', { target: 'C01-01-01', lines: [{ id: 'ST1', qty: 1 }] }),
    /异常/,
  );
  assert.throws(
    () =>
      run(s, 'move', { target: 'A01-01-01', lines: [{ id: 'ST1', qty: 1 }] }),
    /相同/,
  );
});
test('取出闭环：预留、拣货、错码拦截、复核扣减和轨迹', () => {
  let s = seed();
  const baseline = total(s);
  const r = run(s, 'createTask', {
    lines: [
      { id: 'ST1', qty: 15 },
      { id: 'ST2', qty: 8 },
    ],
    wave: 'W1',
    outlet: 'OUT-01',
    reason: '订单发货',
  });
  s = r.state;
  const id = r.result;
  assert.equal(total(s), baseline);
  assert.equal(s.stocks[0].reserved, 15);
  assert.throws(() => run(s, 'verify', { id, checks: [] }), /待复核/);
  s = run(s, 'pick', { id }).state;
  assert.throws(
    () =>
      run(s, 'verify', {
        id,
        checks: [
          { barcode: 'wrong', qty: 15 },
          { barcode: s.products[1].barcode, qty: 8 },
        ],
      }),
    /不匹配/,
  );
  assert.equal(total(s), baseline);
  s = run(s, 'verify', {
    id,
    checks: [
      { barcode: s.products[0].barcode, qty: 15 },
      { barcode: s.products[1].barcode, qty: 8 },
    ],
  }).state;
  assert.equal(total(s), baseline - 23);
  assert.equal(s.stocks[0].reserved, 0);
  assert.equal(s.tasks[0].status, '已完成');
  assert.equal(
    s.events.filter((e) => e.ref === id && e.action === '复核出库').length,
    2,
  );
  assert.throws(() => run(s, 'pick', { id }), /状态/);
});
test('预留防止超量移位、重复拣货；取消恢复可用量', () => {
  let s = seed();
  const r = run(s, 'createTask', {
    lines: [{ id: 'ST1', qty: 100 }],
    wave: 'W1',
    outlet: 'OUT-01',
    reason: '订单发货',
  });
  s = r.state;
  assert.throws(
    () =>
      run(s, 'move', { target: 'A01-02-03', lines: [{ id: 'ST1', qty: 21 }] }),
    /不足/,
  );
  assert.throws(
    () =>
      run(s, 'createTask', {
        lines: [{ id: 'ST1', qty: 21 }],
        wave: 'W2',
        outlet: 'OUT-01',
        reason: '订单发货',
      }),
    /不足/,
  );
  s = run(s, 'cancelTask', { id: r.result }).state;
  assert.equal(s.stocks[0].reserved, 0);
  assert.equal(s.tasks[0].status, '已取消');
  assert.throws(() => run(s, 'cancelTask', { id: r.result }), /取消/);
});
test('新增商品/库位、唯一性与整数数量边界', () => {
  let s = seed();
  s = run(s, 'location', {
    id: 'TEST-01',
    zone: '测试仓',
    rack: 'T01',
    level: '1',
    capacity: 100,
  }).state;
  assert.throws(
    () =>
      run(s, 'location', {
        id: 'TEST-01',
        zone: '测试仓',
        rack: 'T01',
        level: '1',
        capacity: 100,
      }),
    /已存在/,
  );
  s = run(s, 'product', {
    barcode: 'TEST123',
    style: 'T1',
    name: '测试服装',
    color: '蓝色',
    size: 'M',
  }).state;
  assert.equal(s.products.at(-1)!.barcode, 'TEST123');
  for (const qty of [0, -1, 1.5, '20', null, Infinity])
    assert.throws(
      () =>
        run(s, 'register', {
          productId: 'SKU1',
          locationId: 'TEST-01',
          qty,
          box: 'X',
          order: 'Y',
          customer: 'Z',
        }),
      /整数/,
    );
});
test('草稿不影响库存，异常解除留痕，波次状态校验', () => {
  let s = seed();
  const n = total(s);
  s = run(s, 'draft', { barcode: '6974928301568', qty: '10' }).state;
  assert.equal(total(s), n);
  assert.equal(s.draft!.qty, '10');
  s = run(s, 'block', {
    id: 'C01-01-01',
    blocked: false,
    note: '已完成实物核查',
  }).state;
  assert.equal(s.locations.find((l) => l.id === 'C01-01-01')!.blocked, false);
  assert.equal(s.events[0].action, '解除异常');
  const r = run(s, 'createTask', {
    lines: [{ id: 'ST1', qty: 1 }],
    wave: 'W1',
    outlet: 'OUT-01',
    reason: '订单发货',
  });
  s = run(r.state, 'wave', { id: r.result, wave: 'W2' }).state;
  assert.equal(s.tasks[0].wave, 'W2');
  s = run(s, 'pick', { id: r.result }).state;
  assert.throws(() => run(s, 'wave', { id: r.result, wave: 'W3' }), /待拣货/);
});
