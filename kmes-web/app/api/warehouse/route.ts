import { env } from 'cloudflare:workers';
import { seed, mutate } from '@/lib/warehouse';
function db() {
  if (!env.DB) throw new Error('仓储数据库未连接');
  return env.DB;
}
async function read() {
  const d = db();
  await d
    .prepare(
      'INSERT OR IGNORE INTO warehouse_state(id,version,payload) VALUES(1,0,?)',
    )
    .bind(JSON.stringify(seed()))
    .run();
  return await d
    .prepare('SELECT version,payload FROM warehouse_state WHERE id=1')
    .first<{ version: number; payload: string }>();
}
export async function GET() {
  try {
    const r = await read();
    return Response.json(
      { state: JSON.parse(r!.payload), version: r!.version },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      { error: '仓储数据暂时不可用，请稍后重试' },
      { status: 503 },
    );
  }
}
export async function POST(req: Request) {
  if (
    req.headers.get('origin') &&
    req.headers.get('origin') !== new URL(req.url).origin
  )
    return Response.json({ error: '来源校验失败' }, { status: 403 });
  try {
    const body = await req.text();
    if (body.length > 100000)
      return Response.json({ error: '请求过大' }, { status: 413 });
    const { action, payload, requestId } = JSON.parse(body);
    if (!payload || typeof payload !== 'object')
      throw new Error('请求格式错误');
    for (let i = 0; i < 5; i++) {
      const r = await read();
      const { state, result } = mutate(
        JSON.parse(r!.payload),
        action,
        payload,
        requestId,
      );
      const updated = await db()
        .prepare(
          'UPDATE warehouse_state SET payload=?,version=version+1 WHERE id=1 AND version=?',
        )
        .bind(JSON.stringify(state), r!.version)
        .run();
      if (updated.meta.changes)
        return Response.json(
          { state, result, version: r!.version + 1 },
          { headers: { 'Cache-Control': 'no-store' } },
        );
    }
    return Response.json(
      { error: '其他操作正在更新库存，请稍后重试' },
      { status: 409 },
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : '操作失败' },
      { status: 400 },
    );
  }
}
