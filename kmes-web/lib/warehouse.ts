export type Location = {
  id: string;
  zone: string;
  rack: string;
  level: string;
  capacity: number;
  blocked: boolean;
};
export type Product = {
  id: string;
  barcode: string;
  style: string;
  name: string;
  color: string;
  size: string;
  type: string;
};
export type Stock = {
  id: string;
  productId: string;
  locationId: string;
  order: string;
  customer: string;
  box: string;
  qty: number;
  reserved: number;
  updated: string;
};
export type Task = {
  id: string;
  wave: string;
  outlet: string;
  reason: string;
  note: string;
  status: '待拣货' | '待复核' | '已完成' | '已取消';
  lines: {
    stockId: string;
    productId: string;
    locationId: string;
    qty: number;
  }[];
  created: string;
  updated: string;
};
export type Event = {
  id: string;
  time: string;
  action: string;
  productId: string;
  from: string;
  to: string;
  qty: number;
  ref: string;
  note: string;
};
export type Warehouse = {
  locations: Location[];
  products: Product[];
  stocks: Stock[];
  tasks: Task[];
  events: Event[];
  receipts: string[];
  requests: Record<string, { signature: string; result: string }>;
  draft: Record<string, string> | null;
};
export function seed(): Warehouse {
  const locations: Location[] = [];
  for (const [zone, prefix] of [
    ['成品仓 A', 'A'],
    ['成品仓 B', 'B'],
    ['原料仓 R', 'R'],
    ['次品仓 C', 'C'],
  ])
    for (let row = 1; row <= 4; row++)
      for (let col = 1; col <= 6; col++)
        locations.push({
          id: `${prefix}01-${String(row).padStart(2, '0')}-${String(col).padStart(2, '0')}`,
          zone,
          rack: `${prefix}01`,
          level: String(row),
          capacity: 1000,
          blocked: prefix === 'C' && row === 1 && col === 1,
        });
  const products: Product[] = [
    '黑色,M,男士圆领卫衣',
    '白色,L,男士圆领卫衣',
    '藏青,XL,商务休闲长裤',
    '灰色,L,女士针织开衫',
    '卡其,M,休闲工装外套',
    '粉色,S,女士基础衬衫',
    '军绿,XL,轻量防风夹克',
    '红色,M,纯棉短袖T恤',
  ].map((v, i) => {
    const [color, size, name] = v.split(',');
    return {
      id: `SKU${i + 1}`,
      barcode: `697492830${1568 + i}`,
      style: `SL202400${i < 2 ? 1 : i}`,
      name,
      color,
      size,
      type: '成品',
    };
  });
  const now = new Date().toISOString();
  const stocks: Stock[] = products.map((p, i) => ({
    id: `ST${i + 1}`,
    productId: p.id,
    locationId: locations[[0, 1, 6, 24, 25, 30, 7, 72][i]].id,
    order: `DD202430${String(i + 1).padStart(2, '0')}`,
    customer: `KH2400${String(i + 1).padStart(2, '0')}`,
    box: `BX20260908${i + 1}`,
    qty: [120, 80, 65, 40, 32, 28, 60, 5][i],
    reserved: 0,
    updated: now,
  }));
  return {
    locations,
    products,
    stocks,
    tasks: [],
    events: stocks.map((s) => ({
      id: `EV${s.id}`,
      time: now,
      action: '初始库存',
      productId: s.productId,
      from: '收货区',
      to: s.locationId,
      qty: s.qty,
      ref: s.box,
      note: '示例数据',
    })),
    receipts: stocks.map((s) => s.box),
    requests: {},
    draft: null,
  };
}
function required(v: unknown, label: string) {
  if (typeof v !== 'string' || !v.trim() || v.length > 200)
    throw new Error(`${label}不能为空且不能超过200字`);
  return v.trim();
}
function quantity(v: unknown) {
  if (!Number.isSafeInteger(v) || Number(v) <= 0 || Number(v) > 10000000)
    throw new Error('数量必须为1至10000000的整数');
  return Number(v);
}
export function available(s: Stock) {
  return s.qty - s.reserved;
}
export function mutate(
  original: Warehouse,
  action: string,
  p: Record<string, any>,
  requestId: string,
) {
  required(requestId, '请求标识');
  const signature = JSON.stringify({ action, p });
  if (original.requests[requestId]) {
    if (original.requests[requestId].signature !== signature)
      throw new Error('请求标识冲突');
    return { state: original, result: original.requests[requestId].result };
  }
  const s: Warehouse = structuredClone(original),
    now = new Date().toISOString();
  let result = '操作已保存';
  const loc = (id: string) => {
    const l = s.locations.find((x) => x.id === id);
    if (!l) throw new Error('库位不存在');
    return l;
  };
  const stock = (id: string) => {
    const x = s.stocks.find((x) => x.id === id);
    if (!x) throw new Error('库存记录不存在');
    return x;
  };
  const product = (id: string) => {
    const x = s.products.find((x) => x.id === id);
    if (!x) throw new Error('商品不存在');
    return x;
  };
  const room = (id: string, n: number) => {
    const l = loc(id);
    if (l.blocked) throw new Error('异常库位不能执行此操作');
    if (
      s.stocks
        .filter((x) => x.locationId === id)
        .reduce((a, x) => a + x.qty, 0) +
        n >
      l.capacity
    )
      throw new Error('目标库位容量不足');
  };
  const event = (
    action: string,
    productId = '',
    from = '',
    to = '',
    qty = 0,
    ref = '',
    note = '',
  ) =>
    s.events.unshift({
      id: crypto.randomUUID(),
      time: now,
      action,
      productId,
      from,
      to,
      qty,
      ref,
      note,
    });
  if (action === 'location') {
    const id = required(p.id, '库位编码');
    if (!/^[A-Za-z0-9_-]{3,40}$/.test(id))
      throw new Error('库位编码仅支持字母、数字、横线和下划线');
    if (s.locations.some((l) => l.id === id)) throw new Error('库位编码已存在');
    s.locations.push({
      id,
      zone: required(p.zone, '仓区'),
      rack: required(p.rack, '货架'),
      level: required(p.level, '层位'),
      capacity: quantity(p.capacity),
      blocked: false,
    });
    event('新增库位', '', '', id);
  } else if (action === 'product') {
    const barcode = required(p.barcode, '条码');
    if (s.products.some((x) => x.barcode === barcode))
      throw new Error('条码已存在');
    s.products.push({
      id: crypto.randomUUID(),
      barcode,
      style: required(p.style, '款号'),
      name: required(p.name, '款名'),
      color: required(p.color, '颜色'),
      size: required(p.size, '尺码'),
      type: '成品',
    });
    event('新增商品', '', '', '', 0, barcode);
  } else if (action === 'register') {
    const prod = product(p.productId),
      n = quantity(p.qty),
      box = required(p.box, '箱号/登记单号');
    required(p.order, '订单号');
    required(p.customer, '客单号');
    if (s.receipts.includes(box))
      throw new Error('此箱号/登记单号已登记，请勿重复入库');
    room(p.locationId, n);
    s.stocks.push({
      id: crypto.randomUUID(),
      productId: prod.id,
      locationId: p.locationId,
      order: p.order,
      customer: p.customer,
      box,
      qty: n,
      reserved: 0,
      updated: now,
    });
    s.receipts.push(box);
    s.draft = null;
    event('扫码登记', prod.id, '收货区', p.locationId, n, box);
    result = `已登记 ${n} 件至 ${p.locationId}`;
  } else if (action === 'move') {
    if (!Array.isArray(p.lines) || !p.lines.length || p.lines.length > 100)
      throw new Error('请选择1至100条库存');
    const seen = new Set();
    for (const line of p.lines) {
      if (seen.has(line.id)) throw new Error('库存明细重复');
      seen.add(line.id);
      const x = stock(line.id),
        n = quantity(line.qty);
      if (x.locationId === p.target) throw new Error('目标库位不能与来源相同');
      if (loc(x.locationId).blocked) throw new Error('请先解除来源库位异常');
      if (n > available(x)) throw new Error('可用库存不足或已被出库任务预留');
      room(p.target, n);
      const from = x.locationId;
      x.qty -= n;
      x.updated = now;
      let target = s.stocks.find(
        (t) =>
          t.locationId === p.target &&
          t.productId === x.productId &&
          t.box === x.box &&
          t.order === x.order,
      );
      if (target) {
        target.qty += n;
        target.updated = now;
      } else
        s.stocks.push({
          ...x,
          id: crypto.randomUUID(),
          locationId: p.target,
          qty: n,
          reserved: 0,
        });
      event('库位移位', x.productId, from, p.target, n, x.box, p.note || '');
    }
  } else if (action === 'createTask') {
    if (!Array.isArray(p.lines) || !p.lines.length || p.lines.length > 100)
      throw new Error('请选择1至100条库存');
    const id = `CQ${now.slice(0, 10).replaceAll('-', '')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      seen = new Set();
    const lines = p.lines.map((line: any) => {
      if (seen.has(line.id)) throw new Error('库存明细重复');
      seen.add(line.id);
      const x = stock(line.id),
        n = quantity(line.qty);
      if (loc(x.locationId).blocked) throw new Error('异常库位不能取出');
      if (n > available(x)) throw new Error('可用库存不足，请刷新后重试');
      x.reserved += n;
      x.updated = now;
      event('库存预留', x.productId, x.locationId, p.outlet, n, id);
      return {
        stockId: x.id,
        productId: x.productId,
        locationId: x.locationId,
        qty: n,
      };
    });
    s.tasks.unshift({
      id,
      wave: required(p.wave, '波次'),
      outlet: required(p.outlet, '出库口'),
      reason: required(p.reason, '取出原因'),
      note: String(p.note || '').slice(0, 200),
      status: '待拣货',
      lines,
      created: now,
      updated: now,
    });
    result = id;
  } else if (['pick', 'verify', 'cancelTask', 'wave'].includes(action)) {
    const t = s.tasks.find((t) => t.id === p.id);
    if (!t) throw new Error('取出任务不存在');
    if (action === 'wave') {
      if (t.status !== '待拣货') throw new Error('仅待拣货任务可调整波次');
      t.wave = required(p.wave, '波次');
      event('调整波次', '', '', '', 0, t.id, t.wave);
    } else if (action === 'pick') {
      if (t.status !== '待拣货') throw new Error('任务状态已变化');
      for (const line of t.lines) {
        if (loc(line.locationId).blocked)
          throw new Error('来源库位异常，请先处理');
        event(
          '拣货完成',
          line.productId,
          line.locationId,
          t.outlet,
          line.qty,
          t.id,
        );
      }
      t.status = '待复核';
    } else if (action === 'cancelTask') {
      if (t.status !== '待拣货') throw new Error('只能取消尚未拣货的任务');
      for (const line of t.lines) {
        stock(line.stockId).reserved -= line.qty;
        event('取消预留', line.productId, line.locationId, '', line.qty, t.id);
      }
      t.status = '已取消';
    } else {
      if (t.status !== '待复核') throw new Error('仅待复核任务可以出库');
      if (!Array.isArray(p.checks) || p.checks.length !== t.lines.length)
        throw new Error('请逐条扫码并核对数量');
      for (let i = 0; i < t.lines.length; i++) {
        const line = t.lines[i],
          check = p.checks[i],
          x = stock(line.stockId);
        if (
          check.barcode !== product(line.productId).barcode ||
          check.qty !== line.qty
        )
          throw new Error(`第${i + 1}条条码或复核数量不匹配`);
        if (loc(line.locationId).blocked)
          throw new Error('来源库位异常，请先处理');
        if (x.qty < line.qty || x.reserved < line.qty)
          throw new Error('库存状态异常');
        x.qty -= line.qty;
        x.reserved -= line.qty;
        x.updated = now;
        event(
          '复核出库',
          line.productId,
          line.locationId,
          t.outlet,
          line.qty,
          t.id,
        );
      }
      t.status = '已完成';
    }
    t.updated = now;
  } else if (action === 'draft') {
    s.draft = p as Record<string, string>;
    result = '登记草稿已保存';
  } else if (action === 'block') {
    const l = loc(p.id);
    if (typeof p.blocked !== 'boolean') throw new Error('状态无效');
    l.blocked = p.blocked;
    event(
      p.blocked ? '标记异常' : '解除异常',
      '',
      l.id,
      l.id,
      0,
      '',
      required(p.note, '处理说明'),
    );
  } else throw new Error('不支持的操作');
  s.requests[requestId] = { signature, result };
  return { state: s, result };
}
