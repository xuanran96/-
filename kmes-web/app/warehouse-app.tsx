'use client';
import { useState, useEffect, useRef } from 'react';
import {
  Box,
  ScanLine,
  Search,
  ArrowUpRight,
  MapPin,
  Layers,
  Plus,
  Download,
  ArrowRightLeft,
  ChevronRight,
  ChevronLeft,
  SlidersHorizontal,
  Clock,
  TriangleAlert,
  Printer,
  RefreshCw,
  Warehouse as WarehouseIcon,
  Shirt,
  Check,
  Camera,
  Save,
  Trash2,
  Activity,
  ArrowRight,
  X,
  ClipboardList,
  CheckCircle2,
} from 'lucide-react';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from '@/components/ui/pagination';
import type { Warehouse, Stock, Task, Product } from '@/lib/warehouse';
const routes = [
  { id: 'overview', name: '库位总览', icon: Layers },
  { id: 'scan', name: '扫码登记', icon: ScanLine },
  { id: 'search', name: '位置查询', icon: Search },
  { id: 'outbound', name: '取出与追溯', icon: ArrowUpRight },
];
const blank = {
  keyword: '',
  order: '',
  customer: '',
  zone: '全部',
  status: '全部',
  color: '',
  dateFrom: '',
  dateTo: '',
};
const scanBlank = {
  barcode: '',
  productId: '',
  qty: '1',
  box: '',
  order: '',
  customer: '',
  locationId: '',
};
function Pick({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? '')}>
      <SelectTrigger aria-label={label} className="pick">
        <SelectValue>{value || label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((x) => (
          <SelectItem key={x} value={x}>
            {x}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Badge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    已占用: 'green',
    空闲: 'gray',
    异常: 'red',
    待拣货: 'orange',
    待复核: 'blue',
    已完成: 'green',
    已取消: 'gray',
  };
  return (
    <span className={'badge ' + (colors[status] || 'blue')}>
      <i />
      {status}
    </span>
  );
}
function date(v: string) {
  return new Date(v).toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
function download(name: string, rows: unknown[][]) {
  const csv =
    '\ufeff' +
    rows
      .map((row) =>
        row
          .map(
            (v) =>
              '"' +
              String(v ?? '')
                .replace(/^[=+@-]/, "'$&")
                .replaceAll('"', '""') +
              '"',
          )
          .join(','),
      )
      .join('\r\n');
  const url = URL.createObjectURL(
    new Blob([csv], { type: 'text/csv;charset=utf-8' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function WarehouseApp() {
  const [data, setData] = useState<Warehouse | null>(null),
    [page, setPage] = useState('overview'),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(
      null,
    );
  const [filters, setFilters] = useState(blank),
    [applied, setApplied] = useState(blank),
    [advanced, setAdvanced] = useState(false),
    [mode, setMode] = useState('款号'),
    [selected, setSelected] = useState<string[]>([]),
    [pagination, setPagination] = useState(1),
    [pageSize, setPageSize] = useState('10');
  const [modal, setModal] = useState(''),
    [detail, setDetail] = useState(''),
    [form, setForm] = useState<Record<string, string>>({}),
    [scan, setScan] = useState(scanBlank),
    [zone, setZone] = useState('成品仓 A'),
    [focus, setFocus] = useState(''),
    [taskStatus, setTaskStatus] = useState('全部'),
    [checks, setChecks] = useState<{ barcode: string; qty: number }[]>([]),
    [print, setPrint] = useState<
      { title: string; code: string; lines: string[] }[] | null
    >(null);
  const [camera, setCamera] = useState(false);
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    requestRef = useRef<{ signature: string; id: string } | null>(null),
    barcodeRef = useRef<HTMLInputElement>(null);
  function inform(text: string, error = false) {
    setNotice({ text, error });
  }
  async function refresh() {
    try {
      const r = await fetch('/api/warehouse', { cache: 'no-store' });
      const b = (await r.json()) as {
        state: Warehouse;
        error: string;
        result: string;
      };
      if (!r.ok) throw Error(b.error);
      setData(b.state);
      setSelected([]);
    } catch (e) {
      inform((e as Error).message, true);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
    const handler = () => {
      const hash = location.hash.slice(1);
      if (routes.some((r) => r.id === hash)) setPage(hash);
    };
    handler();
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 7000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (page !== 'scan') {
      setCamera(false);
      stream.current?.getTracks().forEach((t) => t.stop());
    }
  }, [page]);
  useEffect(() => {
    if (camera && video.current && stream.current) {
      video.current.srcObject = stream.current;
      void video.current
        .play()
        .catch(() => inform('摄像头无法播放，请使用扫码枪', true));
    }
  }, [camera]);
  useEffect(
    () => () => stream.current?.getTracks().forEach((t) => t.stop()),
    [],
  );
  useEffect(() => {
    if (!print) return;
    void import('jsbarcode')
      .then(({ default: barcode }) => {
        document
          .querySelectorAll<SVGSVGElement>('.print-barcode')
          .forEach((el) =>
            barcode(el, el.dataset.code || '', {
              format: 'CODE128',
              width: 1.5,
              height: 50,
              displayValue: true,
              fontSize: 14,
            }),
          );
        setTimeout(() => window.print(), 250);
      })
      .catch(() => inform('标签条码生成失败，请重试', true));
  }, [print]);
  async function act(action: string, payload: Record<string, unknown>) {
    if (busy) return false;
    setBusy(true);
    const signature = JSON.stringify({ action, payload });
    if (requestRef.current?.signature !== signature)
      requestRef.current = { signature, id: crypto.randomUUID() };
    try {
      const r = await fetch('/api/warehouse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          payload,
          requestId: requestRef.current.id,
        }),
      });
      const b = (await r.json()) as {
        state: Warehouse;
        error: string;
        result: string;
      };
      if (!r.ok) {
        if (r.status < 500) requestRef.current = null;
        throw Error(b.error);
      }
      setData(b.state);
      inform(b.result);
      setSelected([]);
      requestRef.current = null;
      return true;
    } catch (e) {
      inform((e as Error).message || '网络异常，请重试', true);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function navigate(id: string) {
    setPage(id);
    location.hash = id;
    setSelected([]);
    setPagination(1);
  }
  useEffect(() => {
    const context = (document as any).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      Promise.resolve(
        context.registerTool(
          {
            name: 'find_warehouse_stock',
            description: '按款号、条码、订单或库位查询库存并切换至位置查询页',
            inputSchema: {
              type: 'object',
              properties: { keyword: { type: 'string' } },
              required: ['keyword'],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true },
            execute: async (input: any) => {
              if (
                typeof input.keyword !== 'string' ||
                input.keyword.length > 200
              )
                throw Error('无效查询');
              setFilters({ ...blank, keyword: input.keyword });
              setApplied({ ...blank, keyword: input.keyword });
              navigate('search');
              const r = await fetch('/api/warehouse');
              if (!r.ok) throw Error('读取失败');
              const b = (await r.json()) as {
                state: Warehouse;
                error: string;
                result: string;
              };
              setData(b.state);
              return b.state.stocks
                .filter((s: Stock) => {
                  const p = b.state.products.find(
                    (p: Product) => p.id === s.productId,
                  );
                  return JSON.stringify({ ...s, ...p })
                    .toLowerCase()
                    .includes(input.keyword.toLowerCase());
                })
                .map((s: Stock) => ({
                  location: s.locationId,
                  qty: s.qty,
                  available: s.qty - s.reserved,
                  order: s.order,
                }));
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => lifecycle.abort();
  }, []);
  const product = (id: string) => data?.products.find((p) => p.id === id),
    locationBy = (id: string) => data?.locations.find((l) => l.id === id);
  const locQty = (id: string) =>
    data?.stocks
      .filter((s) => s.locationId === id)
      .reduce((a, s) => a + s.qty, 0) || 0;
  const status = (id: string) =>
    locationBy(id)?.blocked ? '异常' : locQty(id) > 0 ? '已占用' : '空闲';
  function show(kind: string, f: Record<string, string> = {}) {
    setForm(f);
    setModal(kind);
  }
  const rows = (data?.stocks || []).filter((s) => {
    const p = product(s.productId),
      l = locationBy(s.locationId);
    if (s.qty <= 0) return false;
    return (
      JSON.stringify({ ...s, ...p })
        .toLowerCase()
        .includes(applied.keyword.toLowerCase()) &&
      s.order.includes(applied.order) &&
      s.customer.includes(applied.customer) &&
      (applied.zone === '全部' || l?.zone === applied.zone) &&
      (applied.status === '全部' || status(s.locationId) === applied.status) &&
      `${p?.color} ${p?.size}`.includes(applied.color) &&
      (!applied.dateFrom || s.updated.slice(0, 10) >= applied.dateFrom) &&
      (!applied.dateTo || s.updated.slice(0, 10) <= applied.dateTo)
    );
  });
  const emptyLocs = (data?.locations || []).filter(
    (l) =>
      locQty(l.id) === 0 &&
      (applied.zone === '全部' || l.zone === applied.zone) &&
      (applied.status === '全部' || status(l.id) === applied.status) &&
      (!applied.keyword ||
        l.id.toLowerCase().includes(applied.keyword.toLowerCase())) &&
      !applied.order &&
      !applied.customer &&
      !applied.color &&
      !applied.dateFrom &&
      !applied.dateTo,
  );
  const tableRows =
    page === 'overview'
      ? [
          ...rows.map((s) => ({
            stock: s as Stock | null,
            loc: locationBy(s.locationId)!,
          })),
          ...emptyLocs.map((l) => ({ stock: null as Stock | null, loc: l })),
        ]
      : rows.map((s) => ({
          stock: s as Stock | null,
          loc: locationBy(s.locationId)!,
        }));
  const pages = Math.max(1, Math.ceil(tableRows.length / Number(pageSize))),
    currentPage = Math.min(pagination, pages),
    visible = tableRows.slice(
      (currentPage - 1) * Number(pageSize),
      currentPage * Number(pageSize),
    );
  const selectedRows = (data?.stocks || []).filter((s) =>
      selected.includes(s.id),
    ),
    selectedTask = data?.tasks.find((t) => t.id === detail),
    detailLoc =
      locationBy(detail)?.id ||
      data?.stocks.find((s) => s.id === detail)?.locationId;
  const total = data?.stocks.reduce((a, s) => a + s.qty, 0) || 0,
    reserved = data?.stocks.reduce((a, s) => a + s.reserved, 0) || 0,
    occupied = data?.locations.filter((l) => locQty(l.id) > 0).length || 0,
    abnormal = data?.locations.filter((l) => l.blocked).length || 0;
  const scanProduct = product(scan.productId),
    zones = Array.from(new Set(data?.locations.map((l) => l.zone) || []));
  function exportStock() {
    download('KMES-库存位置.csv', [
      [
        '款号',
        '条码',
        '订单号',
        '客单号',
        '颜色',
        '尺码',
        '库位',
        '在库',
        '预留',
        '可用',
        '箱号',
      ],
      ...rows.map((s) => {
        const p = product(s.productId);
        return [
          p?.style,
          p?.barcode,
          s.order,
          s.customer,
          p?.color,
          p?.size,
          s.locationId,
          s.qty,
          s.reserved,
          s.qty - s.reserved,
          s.box,
        ];
      }),
    ]);
    inform(`已导出 ${rows.length} 条库存记录`);
  }
  function label(code: string, lines: string[], title = 'KMES 库位标签') {
    setPrint([{ title, code, lines }]);
  }
  function printTask(t: Task) {
    setPrint([
      {
        title: `KMES 拣货单 · ${t.status}`,
        code: t.id,
        lines: [
          `波次：${t.wave}　出库口：${t.outlet}`,
          `创建时间：${date(t.created)}`,
          ...t.lines.map((l) => {
            const p = product(l.productId);
            return `${l.locationId}　${p?.style}　${p?.color}/${p?.size}　${l.qty} 件`;
          }),
        ],
      },
    ]);
  }
  function identify(value = scan.barcode) {
    const found = data?.products.find(
      (p) => p.barcode === value.trim() || p.id === value.trim(),
    );
    const boxStock = data?.stocks.find((s) => s.box === value.trim());
    const p = found || product(boxStock?.productId || '');
    if (!p) {
      inform('未识别条码，请先新增商品资料', true);
      return;
    }
    setScan((old) => ({
      ...old,
      barcode: p.barcode,
      productId: p.id,
      locationId:
        old.locationId ||
        data?.locations.find((l) => !l.blocked && locQty(l.id) < l.capacity)
          ?.id ||
        '',
    }));
    inform(`已识别：${p.name} · ${p.color} / ${p.size}`);
  }
  async function startCamera() {
    try {
      const Detector = (window as any).BarcodeDetector;
      if (!Detector) {
        inform('此浏览器不支持摄像头条码识别，请使用扫码枪或手输条码', true);
        return;
      }
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      setCamera(true);
      const detector = new Detector();
      const detect = async () => {
        if (!stream.current?.active) return;
        if (video.current?.readyState === 4) {
          try {
            const found = await detector.detect(video.current);
            if (found.length) {
              identify(found[0].rawValue);
              stream.current?.getTracks().forEach((t) => t.stop());
              setCamera(false);
              return;
            }
          } catch {}
        }
        setTimeout(detect, 350);
      };
      setTimeout(detect, 500);
    } catch {
      inform('无法访问摄像头，请检查权限或使用扫码枪', true);
    }
  }
  const changeFilter = (k: string, v: string) =>
      setFilters((old) => ({ ...old, [k]: v })),
    changeForm = (k: string, v: string) =>
      setForm((old) => ({ ...old, [k]: v }));
  function timeline(ref?: string) {
    const events = (data?.events || []).filter(
      (e) =>
        !ref ||
        e.from === ref ||
        e.to === ref ||
        e.ref === ref ||
        e.productId === ref,
    );
    return (
      <div className="timeline">
        {events.slice(0, modal === 'history' ? 150 : 5).map((e) => (
          <div className="event" key={e.id}>
            <i className={e.action.includes('出库') ? 'green' : ''} />
            <div>
              <div className="event-title">
                <b>{e.action}</b>
                <time>{date(e.time)}</time>
              </div>
              <p>
                {product(e.productId)?.style || e.ref || '库位操作'}{' '}
                {e.qty > 0 && <strong>{e.qty} 件</strong>}
              </p>
              <small>
                {e.from || '—'} <ArrowRight size={12} /> {e.to || '—'}
              </small>
              {e.note && <p className="muted">{e.note}</p>}
            </div>
          </div>
        ))}
        {!events.length && <div className="empty">暂无相关轨迹</div>}
      </div>
    );
  }
  const filterPanel = (
    <section className="panel filter-panel">
      {page === 'search' && (
        <Tabs value={mode} onValueChange={(v) => setMode(v as string)}>
          <TabsList className="query-tabs">
            {['款号', '订单号', '客单号', '条码'].map((x) => (
              <TabsTrigger key={x} value={x}>
                按{x}查询
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (
            filters.dateFrom &&
            filters.dateTo &&
            filters.dateFrom > filters.dateTo
          ) {
            inform('开始日期不能晚于结束日期', true);
            return;
          }
          setApplied(filters);
          setPagination(1);
          setSelected([]);
        }}
      >
        <div className="filter-grid">
          <div className="search-input">
            <Search size={17} />
            <input
              aria-label="款号或条码"
              placeholder={
                page === 'search'
                  ? `输入${mode} / 关键词`
                  : '输入款号 / 条码 / 库位'
              }
              value={filters.keyword}
              onChange={(e) => changeFilter('keyword', e.target.value)}
            />
          </div>
          <input
            aria-label="订单号筛选"
            placeholder="输入订单号"
            value={filters.order}
            onChange={(e) => changeFilter('order', e.target.value)}
          />
          <input
            aria-label="客单号筛选"
            placeholder="输入客单号"
            value={filters.customer}
            onChange={(e) => changeFilter('customer', e.target.value)}
          />
          <Pick
            label="仓区"
            value={filters.zone}
            onChange={(v) => changeFilter('zone', v)}
            options={['全部', ...zones]}
          />
          <Pick
            label="库位状态"
            value={filters.status}
            onChange={(v) => changeFilter('status', v)}
            options={['全部', '已占用', '空闲', '异常']}
          />
          <button className="primary" type="submit">
            <Search size={16} />
            查询
          </button>
          <button
            className="secondary"
            type="button"
            onClick={() => {
              setFilters(blank);
              setApplied(blank);
              setPagination(1);
              setSelected([]);
            }}
          >
            重置
          </button>
        </div>
        <div className="filter-bottom">
          <span>
            仓区与库存实时联动 <span className="dot" /> 所有数量单位：件
          </span>
          <button
            type="button"
            className="link"
            onClick={() => setAdvanced(!advanced)}
          >
            <SlidersHorizontal size={14} />
            高级筛选
          </button>
        </div>
        {advanced && (
          <div className="advanced">
            <Field label="颜色 / 尺码">
              <input
                placeholder="例如 黑色 或 M"
                value={filters.color}
                onChange={(e) => changeFilter('color', e.target.value)}
              />
            </Field>
            <Field label="最近操作 · 开始日期">
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => changeFilter('dateFrom', e.target.value)}
              />
            </Field>
            <Field label="结束日期">
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => changeFilter('dateTo', e.target.value)}
              />
            </Field>
          </div>
        )}
      </form>
    </section>
  );
  function stockTable() {
    return (
      <section className="panel table-panel">
        <div className="section-head">
          <h2>
            <Layers size={18} />
            {page === 'overview'
              ? '库位明细'
              : page === 'outbound'
                ? '可取出库存'
                : '查询结果'}{' '}
            <span className="count">{tableRows.length}</span>
          </h2>
          <div className="actions">
            {page === 'overview' && (
              <button
                className="primary"
                onClick={() =>
                  show('location', {
                    zone: '成品仓 A',
                    capacity: '1000',
                    level: '1',
                  })
                }
              >
                <Plus size={16} />
                新增库位
              </button>
            )}
            <button
              className="secondary"
              disabled={!selected.length}
              onClick={() =>
                show(page === 'outbound' ? 'createTask' : 'move', {
                  target: '',
                  wave: `W${new Date().toISOString().slice(0, 10).replaceAll('-', '')}`,
                  outlet: 'OUT-01',
                  reason: '订单发货',
                })
              }
            >
              {page === 'outbound' ? (
                <ClipboardList size={16} />
              ) : (
                <ArrowRightLeft size={16} />
              )}{' '}
              {page === 'outbound' ? '生成拣货单' : '批量移位'}
              {selected.length > 0 && ` (${selected.length})`}
            </button>
            <button className="secondary" onClick={exportStock}>
              <Download size={16} />
              导出
            </button>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Checkbox
                  aria-label="选择当前页库存"
                  checked={
                    visible.filter(
                      (r) =>
                        r.stock &&
                        r.stock.qty > r.stock.reserved &&
                        !r.loc.blocked,
                    ).length > 0 &&
                    visible
                      .filter(
                        (r) =>
                          r.stock &&
                          r.stock.qty > r.stock.reserved &&
                          !r.loc.blocked,
                      )
                      .every((r) => selected.includes(r.stock!.id))
                  }
                  onCheckedChange={(v) =>
                    setSelected(
                      v
                        ? visible
                            .filter(
                              (r) =>
                                r.stock &&
                                r.stock.qty > r.stock.reserved &&
                                !r.loc.blocked,
                            )
                            .map((r) => r.stock!.id)
                        : [],
                    )
                  }
                />
              </TableHead>
              {[
                '库位编码',
                '仓区 / 货架',
                '款号',
                '订单号 / 客单号',
                '颜色 / 尺码',
                '在库数量',
                '可用数量',
                '状态',
                '操作',
              ].map((h) => (
                <TableHead key={h}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map(({ stock: s, loc: l }) => {
              const p = product(s?.productId || '');
              return (
                <TableRow key={s?.id || l.id}>
                  <TableCell>
                    {s && (
                      <Checkbox
                        aria-label={`选择 ${l.id} ${p?.color}`}
                        checked={selected.includes(s.id)}
                        disabled={s.qty <= s.reserved || l.blocked}
                        onCheckedChange={(v) =>
                          setSelected((old) =>
                            v
                              ? [...old, s.id]
                              : old.filter((id) => id !== s.id),
                          )
                        }
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <button
                      className="location-code"
                      onClick={() => {
                        setDetail(l.id);
                        show('detail');
                      }}
                    >
                      <MapPin size={14} />
                      {l.id}
                    </button>
                  </TableCell>
                  <TableCell>
                    {l.zone}
                    <small className="subline">
                      {l.rack} / {l.level} 层
                    </small>
                  </TableCell>
                  <TableCell>
                    {p?.style || '—'}
                    <small className="subline">
                      {p?.name || '等待货品入库'}
                    </small>
                  </TableCell>
                  <TableCell>
                    {s?.order || '—'}
                    <small className="subline">{s?.customer || '—'}</small>
                  </TableCell>
                  <TableCell>
                    {p && (
                      <>
                        <span
                          className="color-dot"
                          style={{
                            background: (
                              {
                                黑色: '#333',
                                白色: '#f6f6f6',
                                藏青: '#39486c',
                                灰色: '#b2b6bb',
                                卡其: '#b7a287',
                                粉色: '#e7b5c5',
                                军绿: '#7c8966',
                                红色: '#d75657',
                              } as Record<string, string>
                            )[p.color],
                          }}
                        />
                        {p.color} <span className="size-chip">{p.size}</span>
                      </>
                    )}
                  </TableCell>
                  <TableCell>
                    <b className="number">{s?.qty || 0}</b>
                  </TableCell>
                  <TableCell>
                    {s ? s.qty - s.reserved : 0}
                    {!!s?.reserved && (
                      <small className="subline">预留 {s.reserved}</small>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge status={status(l.id)} />
                  </TableCell>
                  <TableCell>
                    <div className="row-actions">
                      <button
                        onClick={() => {
                          setDetail(s?.id || l.id);
                          show('detail');
                        }}
                      >
                        详情
                      </button>
                      {s && s.qty > s.reserved && !l.blocked && (
                        <button
                          onClick={() => {
                            setSelected([s.id]);
                            show(page === 'outbound' ? 'createTask' : 'move', {
                              qty: String(s.qty - s.reserved),
                              wave: `W${new Date().toISOString().slice(0, 10).replaceAll('-', '')}`,
                              outlet: 'OUT-01',
                              reason: '订单发货',
                            });
                          }}
                        >
                          {page === 'outbound' ? '取出' : '移位'}
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setDetail(l.id);
                          show('history');
                        }}
                      >
                        轨迹
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {!visible.length && (
          <div className="empty">
            <Search size={30} />
            <b>没有匹配的库存</b>
            <span>调整筛选条件，或前往扫码登记新增库存</span>
          </div>
        )}
        <div className="pagination">
          <span>
            共 {tableRows.length} 条 · 已选 {selected.length} 条
          </span>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <button
                  aria-label="上一页"
                  disabled={currentPage === 1}
                  onClick={() => setPagination(currentPage - 1)}
                >
                  <ChevronLeft size={16} />
                </button>
              </PaginationItem>
              {Array.from({ length: Math.min(pages, 5) }, (_, i) => i + 1).map(
                (n) => (
                  <PaginationItem key={n}>
                    <button
                      className={currentPage === n ? 'current' : ''}
                      onClick={() => setPagination(n)}
                    >
                      {n}
                    </button>
                  </PaginationItem>
                ),
              )}
              {pages > 5 && (
                <PaginationItem>
                  <span>… {currentPage > 5 ? currentPage : pages}</span>
                </PaginationItem>
              )}
              <PaginationItem>
                <button
                  aria-label="下一页"
                  disabled={currentPage === pages}
                  onClick={() => setPagination(currentPage + 1)}
                >
                  <ChevronRight size={16} />
                </button>
              </PaginationItem>
            </PaginationContent>
          </Pagination>
          <Pick
            label="每页条数"
            value={pageSize}
            onChange={(v) => {
              setPageSize(v);
              setPagination(1);
            }}
            options={['10', '20', '50']}
          />
        </div>
      </section>
    );
  }
  return (
    <SidebarProvider>
      <Sidebar className="kmes-sidebar">
        <SidebarHeader>
          <div className="brand">
            KMES<span>尚泷科技 · 服装快反制造</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>库存管理</SidebarGroupLabel>
            <SidebarMenu>
              {routes.map((r) => (
                <SidebarMenuItem key={r.id}>
                  <SidebarMenuButton
                    isActive={page === r.id}
                    onClick={() => navigate(r.id)}
                    className="nav-item"
                  >
                    <r.icon />
                    {r.name}
                    {page === r.id && <ChevronRight className="ml-auto" />}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
          <div className="rail-guide">
            <WarehouseIcon size={25} />
            <b>仓储位置管理</b>
            <p>
              从入库到出库
              <br />
              每一步，清晰可溯
            </p>
          </div>
        </SidebarContent>
        <SidebarFooter>
          <div className="rail-footer">
            <span className="dot" />
            独立 Web 工作台<small>示例初始数据 · 操作真实保存</small>
          </div>
        </SidebarFooter>
      </Sidebar>
      <main className="workspace actual">
        <header className="topbar">
          <div className="breadcrumb">
            <SidebarTrigger />
            <span>库存管理</span>
            <ChevronRight size={14} />
            <b>仓储位置管理</b>
          </div>
          <div className="top-right">
            <span className="live">
              <i />
              云端数据
            </span>
            <span className="avatar">仓</span>
            <span>仓库工作台</span>
          </div>
        </header>
        <div className="content">
          <div className="page-head">
            <div>
              <div className="eyebrow">WAREHOUSE OPERATIONS</div>
              <h1>{routes.find((r) => r.id === page)?.name}</h1>
              <p>
                {
                  (
                    {
                      overview: '掌握库位状态，让库存存放有序、流转高效。',
                      scan: '扫描商品条码，识别货品并登记上架。',
                      search: '按款号、订单或条码，快速找到货品存放位置。',
                      outbound: '集中拣货、扫码复核，追溯每一笔库存流转。',
                    } as Record<string, string>
                  )[page]
                }
              </p>
            </div>
            <div className="actions">
              <button
                className="secondary refresh"
                onClick={() => void refresh()}
                aria-label="刷新数据"
              >
                <RefreshCw size={16} />
              </button>
              {page !== 'scan' ? (
                <button className="primary" onClick={() => navigate('scan')}>
                  <ScanLine size={17} />
                  扫码登记
                </button>
              ) : (
                <button className="secondary" onClick={() => show('product')}>
                  <Plus size={17} />
                  新增商品
                </button>
              )}
            </div>
          </div>
          <div className="module-tabs">
            <Tabs value={page} onValueChange={(v) => navigate(v as string)}>
              <TabsList variant="line">
                {routes.map((r) => (
                  <TabsTrigger value={r.id} key={r.id}>
                    <r.icon size={16} />
                    {r.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <span>
              独立数据空间 <span className="muted">/ 尚未接入原 KMES</span>
            </span>
          </div>
          {loading ? (
            <section className="panel empty">
              <RefreshCw className="animate-spin" />
              <b>正在读取仓储数据</b>
            </section>
          ) : !data ? (
            <section className="panel empty">
              <TriangleAlert />
              <h2>暂时无法连接仓储数据</h2>
              <button className="primary" onClick={() => void refresh()}>
                重新连接
              </button>
            </section>
          ) : (
            <>
              {page !== 'scan' && filterPanel}
              {page !== 'scan' && (
                <div className="stats">
                  {[
                    {
                      label: '总库位',
                      value: data.locations.length,
                      foot: `覆盖 ${zones.length} 个仓区`,
                      icon: WarehouseIcon,
                      color: 'blue',
                    },
                    {
                      label: '已占用库位',
                      value: occupied,
                      foot: `占用率 ${((occupied / data.locations.length) * 100).toFixed(1)}%`,
                      icon: Box,
                      color: 'green',
                    },
                    {
                      label: '在库货品',
                      value: total.toLocaleString(),
                      foot: `可用 ${(total - reserved).toLocaleString()} 件`,
                      icon: Layers,
                      color: 'blue',
                    },
                    {
                      label: '待出库预留',
                      value: reserved,
                      foot: `${data.tasks.filter((t) => t.status === '待拣货' || t.status === '待复核').length} 个进行中任务`,
                      icon: Clock,
                      color: 'orange',
                    },
                    {
                      label: '异常库位',
                      value: abnormal,
                      foot: '点击查看并处理',
                      icon: TriangleAlert,
                      color: 'red',
                    },
                  ].map((s, i) => (
                    <button
                      key={s.label}
                      className="stat"
                      onClick={() => {
                        if (i === 3) {
                          navigate('outbound');
                        } else if (i === 2) {
                          navigate('search');
                          setApplied(blank);
                          setFilters(blank);
                        } else {
                          const f = {
                            ...blank,
                            status:
                              i === 4 ? '异常' : i === 1 ? '已占用' : '全部',
                          };
                          setApplied(f);
                          setFilters(f);
                          navigate('overview');
                        }
                      }}
                    >
                      <div>
                        <span className="stat-label">{s.label}</span>
                        <strong>{s.value}</strong>
                        <small>{s.foot}</small>
                      </div>
                      <div className={'stat-icon ' + s.color}>
                        <s.icon size={25} />
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {page === 'overview' && (
                <>
                  {stockTable()}
                  <div className="bottom-grid">
                    <section className="panel">
                      <div className="section-head">
                        <h2>
                          <Activity size={18} />
                          库位使用情况
                        </h2>
                        <span className="muted">按仓区统计</span>
                      </div>
                      <div className="zone-summary">
                        {zones.map((z) => {
                          const all = data.locations.filter(
                              (l) => l.zone === z,
                            ),
                            used = all.filter((l) => locQty(l.id) > 0).length;
                          return (
                            <button
                              key={z}
                              onClick={() => {
                                setZone(z);
                                navigate('search');
                              }}
                            >
                              <span>{z}</span>
                              <div className="progress-track">
                                <i
                                  style={{
                                    width: `${(used / all.length) * 100}%`,
                                  }}
                                />
                              </div>
                              <b>
                                {used}
                                <small> / {all.length}</small>
                              </b>
                              <ChevronRight size={15} />
                            </button>
                          );
                        })}
                      </div>
                    </section>
                    <section className="panel">
                      <div className="section-head">
                        <h2>
                          <Clock size={18} />
                          最近库存动态
                        </h2>
                        <button
                          className="link"
                          onClick={() => {
                            setDetail('');
                            show('history');
                          }}
                        >
                          全部轨迹 <ChevronRight size={14} />
                        </button>
                      </div>
                      {timeline()}
                    </section>
                  </div>
                </>
              )}
              {page === 'search' && (
                <>
                  <div className="search-layout">
                    {stockTable()}
                    <section className="panel map-panel">
                      <div className="section-head">
                        <h2>
                          <MapPin size={18} />
                          库位分布图
                        </h2>
                      </div>
                      <Pick
                        label="地图仓区"
                        value={zone}
                        onChange={(v) => {
                          setZone(v);
                          setFocus('');
                        }}
                        options={zones}
                      />
                      <div className="map-legend">
                        <Badge status="已占用" />
                        <Badge status="空闲" />
                        <Badge status="异常" />
                      </div>
                      <div className="location-map">
                        {data.locations
                          .filter((l) => l.zone === zone)
                          .map((l) => (
                            <button
                              title={`${l.id} · ${locQty(l.id)} 件`}
                              className={
                                (l.blocked
                                  ? 'blocked'
                                  : locQty(l.id)
                                    ? 'used'
                                    : 'vacant') +
                                (focus === l.id ? ' focused' : '')
                              }
                              key={l.id}
                              onClick={() => {
                                setFocus(l.id);
                                setDetail(l.id);
                                show('detail');
                              }}
                            >
                              <Layers size={18} />
                              <span>{l.id.replace(l.rack + '-', '')}</span>
                            </button>
                          ))}
                      </div>
                      <div className="map-note">
                        <MapPin size={16} />
                        {focus || '点击格位查看货品与库存'}
                      </div>
                    </section>
                  </div>
                  <section className="panel">
                    <div className="section-head">
                      <h2>
                        <Shirt size={18} />
                        同款分色分码库存
                      </h2>
                      <span className="muted">按当前筛选结果汇总 · 件</span>
                    </div>
                    <div className="product-summary">
                      {data.products
                        .filter((p) => rows.some((s) => s.productId === p.id))
                        .map((p) => (
                          <div key={p.id}>
                            <div className="shirt-tile">
                              <Shirt size={30} />
                            </div>
                            <div>
                              <b>{p.style}</b>
                              <p>
                                {p.color} / {p.size}
                              </p>
                            </div>
                            <strong>
                              {rows
                                .filter((s) => s.productId === p.id)
                                .reduce((a, s) => a + s.qty, 0)}
                            </strong>
                          </div>
                        ))}
                    </div>
                  </section>
                </>
              )}
              {page === 'scan' && (
                <>
                  <div className="steps">
                    {['扫描条码', '识别单据', '分配库位', '确认完成'].map(
                      (x, i) => (
                        <div
                          key={x}
                          className={
                            i === 0 || (scan.productId && i <= 2)
                              ? 'reached'
                              : ''
                          }
                        >
                          <span>{i + 1}</span>
                          <div>
                            <b>{x}</b>
                            <small>
                              {
                                [
                                  '扫码枪或手动输入',
                                  '核对款号与颜色尺码',
                                  '选择可用的存放位置',
                                  '保存登记并更新库存',
                                ][i]
                              }
                            </small>
                          </div>
                          {i < 3 && <div className="step-line" />}
                        </div>
                      ),
                    )}
                  </div>
                  <div className="scan-grid">
                    <section className="panel">
                      <div className="section-head">
                        <h2>
                          <ScanLine size={18} />
                          条码识别
                        </h2>
                        <button
                          className="link"
                          onClick={() => void startCamera()}
                        >
                          <Camera size={16} />
                          摄像头扫描
                        </button>
                      </div>
                      <div className="scan-target">
                        {camera ? (
                          <>
                            <video ref={video} muted playsInline />
                            <button
                              className="secondary"
                              onClick={() => {
                                stream.current
                                  ?.getTracks()
                                  .forEach((t) => t.stop());
                                setCamera(false);
                              }}
                            >
                              停止摄像头
                            </button>
                          </>
                        ) : (
                          <>
                            <div className="scan-brackets">
                              <ScanLine size={88} strokeWidth={1} />
                            </div>
                            <h3>请扫描商品条码或箱唛</h3>
                            <p>支持扫码枪回车提交，也可手动输入</p>
                          </>
                        )}
                      </div>
                      <form
                        className="scan-input"
                        onSubmit={(e) => {
                          e.preventDefault();
                          identify();
                        }}
                      >
                        <input
                          ref={barcodeRef}
                          aria-label="扫描条码"
                          placeholder="请输入条码 / 箱唛码 / SKU码"
                          value={scan.barcode}
                          onChange={(e) =>
                            setScan({
                              ...scan,
                              barcode: e.target.value,
                              productId: '',
                            })
                          }
                        />
                        <button className="primary">
                          <ScanLine size={16} />
                          识别条码
                        </button>
                      </form>
                      <div className="hint">
                        <b>首次使用</b>
                        <p>
                          选择下方商品填入示例条码，或点击“新增商品”录入自己的货品。
                        </p>
                        <div className="sample-codes">
                          {data.products.slice(0, 3).map((p) => (
                            <button
                              key={p.id}
                              onClick={() => identify(p.barcode)}
                            >
                              {p.style} · {p.color} {p.size}
                              <ArrowUpRight size={13} />
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="scan-totals">
                        <div>
                          <span>登记记录</span>
                          <b>
                            {
                              data.events.filter((e) => e.action === '扫码登记')
                                .length
                            }
                          </b>
                        </div>
                        <div>
                          <span>累计登记件数</span>
                          <b>
                            {data.events
                              .filter((e) => e.action === '扫码登记')
                              .reduce((a, e) => a + e.qty, 0)}
                          </b>
                        </div>
                        <div>
                          <span>登记草稿</span>
                          <b>{data.draft ? '1' : '0'}</b>
                        </div>
                      </div>
                    </section>
                    <section className="panel">
                      <div className="section-head">
                        <h2>识别结果 / 登记信息</h2>
                        <Badge status={scanProduct ? '待登记' : '待识别'} />
                      </div>
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (
                            await act('register', {
                              ...scan,
                              qty: Number(scan.qty),
                            })
                          ) {
                            setScan(scanBlank);
                            barcodeRef.current?.focus();
                          }
                        }}
                      >
                        <div className="form-grid">
                          <Field label="款号">
                            <input
                              readOnly
                              value={scanProduct?.style || ''}
                              placeholder="扫描后自动识别"
                            />
                          </Field>
                          <Field label="款名">
                            <input readOnly value={scanProduct?.name || ''} />
                          </Field>
                          <Field label="颜色">
                            <input readOnly value={scanProduct?.color || ''} />
                          </Field>
                          <Field label="尺码">
                            <input readOnly value={scanProduct?.size || ''} />
                          </Field>
                          <Field label="订单号 *">
                            <input
                              required
                              value={scan.order}
                              onChange={(e) =>
                                setScan({ ...scan, order: e.target.value })
                              }
                              placeholder="输入对应订单号"
                            />
                          </Field>
                          <Field label="客单号 *">
                            <input
                              required
                              value={scan.customer}
                              onChange={(e) =>
                                setScan({ ...scan, customer: e.target.value })
                              }
                              placeholder="输入客户单号"
                            />
                          </Field>
                          <Field label="箱号 / 登记单号 *">
                            <input
                              required
                              value={scan.box}
                              onChange={(e) =>
                                setScan({ ...scan, box: e.target.value })
                              }
                              placeholder="唯一编号，防止重复登记"
                            />
                          </Field>
                          <Field label="登记数量（件）*">
                            <input
                              type="number"
                              min="1"
                              step="1"
                              max="10000000"
                              required
                              value={scan.qty}
                              onChange={(e) =>
                                setScan({ ...scan, qty: e.target.value })
                              }
                            />
                          </Field>
                        </div>
                        <div className="form-divider">
                          <MapPin size={16} />
                          选择存放位置
                        </div>
                        <div className="form-grid">
                          <Field label="仓区">
                            <Pick
                              value={locationBy(scan.locationId)?.zone || ''}
                              label="登记仓区"
                              options={zones}
                              onChange={(z) =>
                                setScan({
                                  ...scan,
                                  locationId:
                                    data.locations.find(
                                      (l) => l.zone === z && !l.blocked,
                                    )?.id || '',
                                })
                              }
                            />
                          </Field>
                          <Field label="库位 *">
                            <Pick
                              value={scan.locationId}
                              label="选择库位"
                              options={data.locations
                                .filter(
                                  (l) =>
                                    !l.blocked &&
                                    (!scan.locationId ||
                                      l.zone ===
                                        locationBy(scan.locationId)?.zone),
                                )
                                .map((l) => l.id)}
                              onChange={(v) =>
                                setScan({ ...scan, locationId: v })
                              }
                            />
                          </Field>
                        </div>
                        {scan.locationId && (
                          <p className="capacity-note">
                            当前存放 {locQty(scan.locationId)} 件 / 容量{' '}
                            {locationBy(scan.locationId)?.capacity} 件
                          </p>
                        )}
                        <div className="form-actions">
                          <button
                            className="primary"
                            disabled={busy || !scanProduct || !scan.locationId}
                          >
                            <Check size={16} />
                            确认登记
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            disabled={busy}
                            onClick={() => void act('draft', scan)}
                          >
                            <Save size={16} />
                            暂存
                          </button>
                          {data.draft && (
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => {
                                setScan({ ...scanBlank, ...data.draft });
                                inform('已恢复登记草稿');
                              }}
                            >
                              恢复草稿
                            </button>
                          )}
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => setScan(scanBlank)}
                          >
                            <Trash2 size={16} />
                            清空
                          </button>
                        </div>
                      </form>
                    </section>
                  </div>
                  <section className="panel">
                    <div className="section-head">
                      <h2>
                        <Clock size={18} />
                        最近登记记录
                      </h2>
                      <button
                        className="link"
                        onClick={() => {
                          setDetail('');
                          show('history');
                        }}
                      >
                        全部轨迹
                        <ChevronRight size={14} />
                      </button>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {[
                            '登记时间',
                            '款号',
                            '条码',
                            '箱号',
                            '登记库位',
                            '数量',
                            '操作',
                          ].map((x) => (
                            <TableHead key={x}>{x}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.events
                          .filter((e) => e.action === '扫码登记')
                          .slice(0, 10)
                          .map((e) => (
                            <TableRow key={e.id}>
                              <TableCell>{date(e.time)}</TableCell>
                              <TableCell>
                                {product(e.productId)?.style}
                              </TableCell>
                              <TableCell>
                                {product(e.productId)?.barcode}
                              </TableCell>
                              <TableCell>{e.ref}</TableCell>
                              <TableCell>{e.to}</TableCell>
                              <TableCell>{e.qty}</TableCell>
                              <TableCell>
                                <button
                                  className="link"
                                  onClick={() =>
                                    label(
                                      e.ref,
                                      [
                                        product(e.productId)?.style || '',
                                        e.to,
                                        `${e.qty} 件`,
                                      ],
                                      'KMES 箱号标签',
                                    )
                                  }
                                >
                                  打印标签
                                </button>
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                    {!data.events.some((e) => e.action === '扫码登记') && (
                      <div className="empty compact">
                        完成首次登记后，记录会显示在这里
                      </div>
                    )}
                  </section>
                </>
              )}
              {page === 'outbound' && (
                <>
                  {stockTable()}
                  <section className="panel task-panel">
                    <div className="section-head">
                      <h2>
                        <ClipboardList size={18} />
                        取出任务{' '}
                        <span className="count">{data.tasks.length}</span>
                      </h2>
                      <div className="actions">
                        <Pick
                          label="任务状态"
                          value={taskStatus}
                          onChange={setTaskStatus}
                          options={[
                            '全部',
                            '待拣货',
                            '待复核',
                            '已完成',
                            '已取消',
                          ]}
                        />
                        <button
                          className="secondary"
                          onClick={() =>
                            download('KMES-取出记录.csv', [
                              [
                                '取出单号',
                                '波次',
                                '出库口',
                                '数量',
                                '状态',
                                '创建时间',
                              ],
                              ...data.tasks
                                .filter(
                                  (t) =>
                                    taskStatus === '全部' ||
                                    t.status === taskStatus,
                                )
                                .map((t) => [
                                  t.id,
                                  t.wave,
                                  t.outlet,
                                  t.lines.reduce((a, l) => a + l.qty, 0),
                                  t.status,
                                  t.created,
                                ]),
                            ])
                          }
                        >
                          <Download size={16} />
                          导出记录
                        </button>
                      </div>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {[
                            '取出单号',
                            '波次',
                            '出库口',
                            '取出数量',
                            '创建时间',
                            '状态',
                            '操作',
                          ].map((x) => (
                            <TableHead key={x}>{x}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.tasks
                          .filter(
                            (t) =>
                              taskStatus === '全部' || t.status === taskStatus,
                          )
                          .map((t) => (
                            <TableRow key={t.id}>
                              <TableCell>
                                <b>{t.id}</b>
                              </TableCell>
                              <TableCell>{t.wave}</TableCell>
                              <TableCell>{t.outlet}</TableCell>
                              <TableCell>
                                {t.lines.reduce((a, l) => a + l.qty, 0)} 件
                              </TableCell>
                              <TableCell>{date(t.created)}</TableCell>
                              <TableCell>
                                <Badge status={t.status} />
                              </TableCell>
                              <TableCell>
                                <div className="row-actions">
                                  <button
                                    onClick={() => {
                                      setDetail(t.id);
                                      show('task');
                                    }}
                                  >
                                    详情
                                  </button>
                                  <button onClick={() => printTask(t)}>
                                    打印
                                  </button>
                                  {t.status === '待拣货' && (
                                    <>
                                      <button
                                        onClick={() => {
                                          setDetail(t.id);
                                          show('pick');
                                        }}
                                      >
                                        确认拣货
                                      </button>
                                      <button
                                        onClick={() => {
                                          setDetail(t.id);
                                          show('wave', { wave: t.wave });
                                        }}
                                      >
                                        波次
                                      </button>
                                      <button
                                        onClick={() => {
                                          setDetail(t.id);
                                          show('cancelTask');
                                        }}
                                      >
                                        取消
                                      </button>
                                    </>
                                  )}
                                  {t.status === '待复核' && (
                                    <button
                                      onClick={() => {
                                        setDetail(t.id);
                                        setChecks(
                                          t.lines.map(() => ({
                                            barcode: '',
                                            qty: 0,
                                          })),
                                        );
                                        show('verify');
                                      }}
                                    >
                                      扫码复核
                                    </button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                    {!data.tasks.some(
                      (t) => taskStatus === '全部' || t.status === taskStatus,
                    ) && (
                      <div className="empty">
                        <ClipboardList size={32} />
                        <b>
                          暂无{taskStatus === '全部' ? '' : taskStatus}取出任务
                        </b>
                        <span>在上方选择库存，点击“生成拣货单”开始取出</span>
                      </div>
                    )}
                  </section>
                </>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>
              尚泷 KMES <span className="muted">/ 仓储位置管理</span>
            </span>
            <span>示例初始库存 · 新操作持久保存</span>
          </footer>
        </div>
      </main>
      {notice && (
        <div role="status" className={'toast ' + (notice.error ? 'error' : '')}>
          {notice.error ? (
            <TriangleAlert size={20} />
          ) : (
            <CheckCircle2 size={20} />
          )}
          <span>{notice.text}</span>
          <button aria-label="关闭提示" onClick={() => setNotice(null)}>
            <X size={16} />
          </button>
        </div>
      )}
      <Dialog
        open={!!modal}
        onOpenChange={(open) => {
          if (!open && !busy) setModal('');
        }}
      >
        <DialogContent className="kmes-dialog">
          <DialogTitle>
            {
              (
                {
                  location: '新增库位',
                  product: '新增商品资料',
                  move: '库存移位',
                  createTask: '生成拣货单',
                  detail: '库位与货品详情',
                  history: '库存轨迹',
                  task: '取出任务详情',
                  pick: '确认拣货完成',
                  verify: '扫码复核出库',
                  cancelTask: '取消取出任务',
                  wave: '调整拣货波次',
                  block: '库位异常处理',
                } as Record<string, string>
              )[modal]
            }
          </DialogTitle>
          <DialogDescription>
            {modal === 'move'
              ? '移位只改变存放位置，在库总量保持不变。'
              : modal === 'createTask'
                ? '创建后预留所选数量，完成扫码复核后正式出库。'
                : modal === 'verify'
                  ? '逐项扫描实际商品条码并输入实点数量。'
                  : '操作保存后，其他页面的库存与轨迹同步更新。'}
          </DialogDescription>
          {[
            'location',
            'product',
            'move',
            'createTask',
            'wave',
            'block',
          ].includes(modal) && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                let ok = false;
                if (modal === 'location')
                  ok = await act('location', {
                    ...form,
                    capacity: Number(form.capacity),
                  });
                if (modal === 'product') ok = await act('product', form);
                if (modal === 'move' || modal === 'createTask')
                  ok = await act(modal, {
                    ...form,
                    lines: selectedRows.map((s) => ({
                      id: s.id,
                      qty: Number(
                        form['qty_' + s.id] ?? form.qty ?? s.qty - s.reserved,
                      ),
                    })),
                  });
                if (modal === 'wave')
                  ok = await act('wave', { id: detail, wave: form.wave });
                if (modal === 'block')
                  ok = await act('block', {
                    id: detail,
                    blocked: !locationBy(detail)?.blocked,
                    note: form.note,
                  });
                if (ok) setModal('');
              }}
            >
              <div className="form-grid">
                {modal === 'location' &&
                  [
                    ['id', '库位编码 *', '如 A02-01-01'],
                    ['zone', '仓区 *', '如 成品仓 A'],
                    ['rack', '货架 *', '如 A02'],
                    ['level', '层位 *', '如 1'],
                    ['capacity', '容量（件）*', '1000'],
                  ].map(([k, l, p]) => (
                    <Field key={k} label={l}>
                      <input
                        required
                        placeholder={p}
                        type={k === 'capacity' ? 'number' : 'text'}
                        min="1"
                        value={form[k] || ''}
                        onChange={(e) => changeForm(k, e.target.value)}
                      />
                    </Field>
                  ))}
                {modal === 'product' &&
                  [
                    ['barcode', '商品条码 *'],
                    ['style', '款号 *'],
                    ['name', '款名 *'],
                    ['color', '颜色 *'],
                    ['size', '尺码 *'],
                  ].map(([k, l]) => (
                    <Field key={k} label={l}>
                      <input
                        required
                        maxLength={100}
                        value={form[k] || ''}
                        onChange={(e) => changeForm(k, e.target.value)}
                      />
                    </Field>
                  ))}
                {modal === 'move' && (
                  <Field label="目标库位 *">
                    <Pick
                      label="选择目标库位"
                      value={form.target || ''}
                      onChange={(v) => changeForm('target', v)}
                      options={
                        data?.locations
                          .filter(
                            (l) =>
                              !l.blocked &&
                              !selectedRows.some((s) => s.locationId === l.id),
                          )
                          .map((l) => l.id) || []
                      }
                    />
                  </Field>
                )}
                {['createTask', 'wave'].includes(modal) && (
                  <Field label="拣货波次 *">
                    <input
                      required
                      value={form.wave || ''}
                      onChange={(e) => changeForm('wave', e.target.value)}
                    />
                  </Field>
                )}
                {modal === 'createTask' && (
                  <>
                    <Field label="目标出库口">
                      <Pick
                        label="出库口"
                        value={form.outlet || 'OUT-01'}
                        onChange={(v) => changeForm('outlet', v)}
                        options={['OUT-01', 'OUT-02', 'OUT-03', 'OUT-04']}
                      />
                    </Field>
                    <Field label="取出原因">
                      <Pick
                        label="取出原因"
                        value={form.reason || '订单发货'}
                        onChange={(v) => changeForm('reason', v)}
                        options={['订单发货', '领用出库', '退货出库']}
                      />
                    </Field>
                  </>
                )}
                {['move', 'createTask', 'block'].includes(modal) && (
                  <Field label={modal === 'block' ? '处理说明 *' : '备注'}>
                    <input
                      maxLength={200}
                      required={modal === 'block'}
                      value={form.note || ''}
                      onChange={(e) => changeForm('note', e.target.value)}
                    />
                  </Field>
                )}
              </div>
              {['move', 'createTask'].includes(modal) && (
                <div className="selection-list">
                  {selectedRows.map((s) => (
                    <div key={s.id}>
                      <div>
                        <b>
                          {product(s.productId)?.style} ·{' '}
                          {product(s.productId)?.color}/
                          {product(s.productId)?.size}
                        </b>
                        <small>
                          {s.locationId}　可用 {s.qty - s.reserved} 件
                        </small>
                      </div>
                      <input
                        aria-label={`${s.id}操作数量`}
                        type="number"
                        min="1"
                        max={s.qty - s.reserved}
                        step="1"
                        required
                        value={
                          form['qty_' + s.id] ?? form.qty ?? s.qty - s.reserved
                        }
                        onChange={(e) =>
                          changeForm('qty_' + s.id, e.target.value)
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
              <div className="form-actions">
                <button
                  className="secondary"
                  type="button"
                  onClick={() => setModal('')}
                >
                  取消
                </button>
                <button className="primary" disabled={busy}>
                  {busy ? '正在保存…' : '确认保存'}
                </button>
              </div>
            </form>
          )}
          {modal === 'detail' && detailLoc && (
            <>
              <div className="detail-hero">
                <div className="stat-icon blue">
                  <MapPin size={28} />
                </div>
                <div>
                  <h2>{detailLoc}</h2>
                  <p>
                    {locationBy(detailLoc)?.zone} /{' '}
                    {locationBy(detailLoc)?.rack} /{' '}
                    {locationBy(detailLoc)?.level} 层
                  </p>
                </div>
                <Badge status={status(detailLoc)} />
              </div>
              <div className="detail-metrics">
                <div>
                  <span>在库数量</span>
                  <b>{locQty(detailLoc)}</b>
                </div>
                <div>
                  <span>库位容量</span>
                  <b>{locationBy(detailLoc)?.capacity}</b>
                </div>
                <div>
                  <span>货品种类</span>
                  <b>
                    {
                      new Set(
                        data?.stocks
                          .filter(
                            (s) => s.locationId === detailLoc && s.qty > 0,
                          )
                          .map((s) => s.productId),
                      ).size
                    }
                  </b>
                </div>
              </div>
              <div className="detail-stocks">
                {data?.stocks
                  .filter((s) => s.locationId === detailLoc && s.qty > 0)
                  .map((s) => (
                    <div key={s.id}>
                      <Shirt size={24} />
                      <div>
                        <b>
                          {product(s.productId)?.style} ·{' '}
                          {product(s.productId)?.name}
                        </b>
                        <p>
                          {product(s.productId)?.color} /{' '}
                          {product(s.productId)?.size}　{s.order}
                        </p>
                        <small>
                          条码 {product(s.productId)?.barcode}　箱号 {s.box}
                        </small>
                      </div>
                      <strong>
                        {s.qty}
                        <small>预留 {s.reserved}</small>
                      </strong>
                    </div>
                  ))}
              </div>
              <div className="actions wrap">
                <button
                  className="secondary"
                  onClick={() =>
                    label(detailLoc, [
                      locationBy(detailLoc)?.zone || '',
                      `货架 ${locationBy(detailLoc)?.rack} / ${locationBy(detailLoc)?.level} 层`,
                    ])
                  }
                >
                  <Printer size={16} />
                  打印库位标签
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    setZone(locationBy(detailLoc)!.zone);
                    setFocus(detailLoc);
                    navigate('search');
                    setModal('');
                  }}
                >
                  <MapPin size={16} />
                  地图定位
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    setDetail(detailLoc);
                    show('history');
                  }}
                >
                  查看轨迹
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    setDetail(detailLoc);
                    show('block');
                  }}
                >
                  {locationBy(detailLoc)?.blocked ? '解除异常' : '标记异常'}
                </button>
              </div>
            </>
          )}
          {modal === 'history' && timeline(detail)}
          {['task', 'pick', 'cancelTask', 'verify'].includes(modal) &&
            selectedTask && (
              <>
                <div className="task-info">
                  <b>{selectedTask.id}</b>
                  <Badge status={selectedTask.status} />
                  <p>
                    波次 {selectedTask.wave}　/　{selectedTask.outlet}　/　
                    {selectedTask.reason}
                  </p>
                </div>
                {selectedTask.lines.map((l, i) => (
                  <div className="verify-line" key={l.stockId}>
                    <b>
                      {i + 1}. {product(l.productId)?.style} ·{' '}
                      {product(l.productId)?.color}/{product(l.productId)?.size}
                    </b>
                    <p>
                      {l.locationId} → {selectedTask.outlet}　应取{' '}
                      <strong>{l.qty} 件</strong>
                    </p>
                    {modal === 'verify' && (
                      <div className="form-grid">
                        <Field label="扫描实际商品条码">
                          <input
                            aria-label={`第${i + 1}条复核条码`}
                            placeholder="使用扫码枪或手输"
                            value={checks[i]?.barcode || ''}
                            onChange={(e) =>
                              setChecks((old) =>
                                old.map((c, j) =>
                                  j === i
                                    ? { ...c, barcode: e.target.value }
                                    : c,
                                ),
                              )
                            }
                          />
                        </Field>
                        <Field label="实点数量">
                          <input
                            type="number"
                            min="1"
                            value={checks[i]?.qty || ''}
                            onChange={(e) =>
                              setChecks((old) =>
                                old.map((c, j) =>
                                  j === i
                                    ? { ...c, qty: Number(e.target.value) }
                                    : c,
                                ),
                              )
                            }
                          />
                        </Field>
                      </div>
                    )}
                  </div>
                ))}
                {modal === 'task' ? (
                  <>
                    <div className="form-actions">
                      <button
                        className="secondary"
                        onClick={() => printTask(selectedTask)}
                      >
                        <Printer size={16} />
                        打印拣货单
                      </button>
                      <button
                        className="secondary"
                        onClick={() => show('history')}
                      >
                        查看轨迹
                      </button>
                    </div>
                    {timeline(selectedTask.id)}
                  </>
                ) : (
                  <>
                    <p className="hint">
                      {modal === 'pick'
                        ? '请确认已按清单完成实物拣货。下一步为扫码复核。'
                        : modal === 'cancelTask'
                          ? '取消后将释放此任务预留库存，可重新安排取出。'
                          : '确认后正式扣减库存、释放预留并记录出库轨迹。'}
                    </p>
                    <div className="form-actions">
                      <button
                        className="secondary"
                        onClick={() => setModal('')}
                      >
                        返回
                      </button>
                      <button
                        disabled={busy}
                        className="primary"
                        onClick={async () => {
                          if (await act(modal, { id: selectedTask.id, checks }))
                            setModal('');
                        }}
                      >
                        {busy
                          ? '处理中…'
                          : '确认' +
                            (modal === 'pick'
                              ? '拣货'
                              : modal === 'cancelTask'
                                ? '取消任务'
                                : '复核出库')}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
        </DialogContent>
      </Dialog>
      <div className="print-area">
        {print?.map((p, i) => (
          <section key={i}>
            <h1>{p.title}</h1>
            <svg className="print-barcode" data-code={p.code} />
            {p.lines.map((l, j) => (
              <p key={j}>{l}</p>
            ))}
          </section>
        ))}
      </div>
    </SidebarProvider>
  );
}
