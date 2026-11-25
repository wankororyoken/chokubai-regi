import { useEffect, useMemo, useState } from 'react';
import { RemotePanel, type Scope } from './RemotePanel';
import { loadSales, type ListedSale } from './salesData';
import type { SummaryData } from './types';
import { dayKey, formatTime, yen } from './util';

type Props = { onBack: () => void };
type Mode = 'day' | 'month';

/** 場所の絞り込み：ALL はすべての場所、'' は場所が未設定の取引 */
const ALL = '__all__';

function range(mode: Mode, base: Date) {
  const start =
    mode === 'day'
      ? new Date(base.getFullYear(), base.getMonth(), base.getDate())
      : new Date(base.getFullYear(), base.getMonth(), 1);
  const end =
    mode === 'day'
      ? new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1)
      : new Date(base.getFullYear(), base.getMonth() + 1, 1);
  return { start, end };
}

/** 取引の一覧から集計する（取消した取引は除く） */
function summarize(all: ListedSale[]): SummaryData {
  const sales = all.filter((s) => !s.voided);
  const map = new Map<string, SummaryData['items'][number]>();
  const devices = new Map<string, { device: string; count: number; total: number }>();
  const locations = new Map<string, { location: string; count: number; total: number }>();
  let cash = 0;
  let paypay = 0;
  for (const s of sales) {
    if (s.method === 'cash') cash += s.total;
    else paypay += s.total;
    const dev = s.remote ? s.device || '他の端末' : `${s.device}（この端末）`;
    const d = devices.get(dev) ?? { device: dev, count: 0, total: 0 };
    d.count++;
    d.total += s.total;
    devices.set(dev, d);
    const loc = s.location || '';
    const l = locations.get(loc) ?? { location: loc, count: 0, total: 0 };
    l.count++;
    l.total += s.total;
    locations.set(loc, l);
    for (const i of s.items) {
      const row = map.get(i.name) ?? { name: i.name, qty: 0, amount: 0, cashAmount: 0, paypayAmount: 0, paypayQty: 0 };
      row.qty += i.qty;
      row.amount += i.subtotal;
      if (s.method === 'cash') row.cashAmount += i.subtotal;
      else {
        row.paypayAmount += i.subtotal;
        row.paypayQty += i.qty;
      }
      map.set(i.name, row);
    }
  }
  const paypaySales = sales
    .filter((s) => s.method === 'paypay')
    .map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      total: s.total,
      device: s.remote ? s.device : 'この端末',
      location: s.location ?? '',
      items: s.items.map((i) => `${i.name}×${i.qty}`).join('、'),
    }));
  return {
    count: sales.length,
    cash,
    paypay,
    paypayCount: paypaySales.length,
    items: [...map.values()].sort((a, b) => b.amount - a.amount),
    paypaySales,
    devices: [...devices.values()].sort((a, b) => b.total - a.total),
    locations: [...locations.values()].sort((a, b) => b.total - a.total),
  };
}

export function SummaryScreen({ onBack }: Props) {
  const [scope, setScope] = useState<Scope>('all');
  const [mode, setMode] = useState<Mode>('day');
  const [base, setBase] = useState(() => new Date());
  const [sales, setSales] = useState<ListedSale[]>([]);
  const [place, setPlace] = useState<string>(ALL);

  const { start, end } = range(mode, base);
  const startKey = start.toISOString();

  const load = async () => setSales(await loadSales(start, end, scope === 'all'));
  useEffect(() => {
    load();
    // 期間（startKey）と表示する端末が変わったら読み直す
  }, [scope, mode, startKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // この期間に売った場所の一覧（絞り込みの選択肢）
  const places = useMemo(() => [...new Set(sales.filter((s) => !s.voided).map((s) => s.location || ''))], [sales]);
  const currentPlace = place === ALL || places.includes(place) ? place : ALL;
  const data = useMemo(
    () => summarize(currentPlace === ALL ? sales : sales.filter((s) => (s.location || '') === currentPlace)),
    [sales, currentPlace],
  );

  const now = new Date();
  const isCurrent =
    mode === 'day'
      ? dayKey(base) === dayKey(now)
      : base.getFullYear() === now.getFullYear() && base.getMonth() === now.getMonth();
  const shift = (n: number) =>
    setBase(
      mode === 'day'
        ? new Date(base.getFullYear(), base.getMonth(), base.getDate() + n)
        : new Date(base.getFullYear(), base.getMonth() + n, 1),
    );
  const label =
    mode === 'day'
      ? `${base.getMonth() + 1}月${base.getDate()}日${isCurrent ? '（今日）' : ''}`
      : `${base.getFullYear()}年${base.getMonth() + 1}月${isCurrent ? '（今月）' : ''}`;

  return (
    <div className="page">
      <div className="page-head">
        <button type="button" className="btn btn-sub" onClick={onBack}>
          ← レジに戻る
        </button>
        <h1>集計</h1>
        <span />
      </div>

      <RemotePanel scope={scope} onScope={setScope} start={start} end={end} onFetched={load} />

      <div className="mode-switch" role="tablist" aria-label="期間">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'day'}
          className={`btn tab ${mode === 'day' ? 'on' : ''}`}
          onClick={() => {
            setMode('day');
            setBase(new Date());
          }}
        >
          日ごと
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'month'}
          className={`btn tab ${mode === 'month' ? 'on' : ''}`}
          onClick={() => {
            setMode('month');
            setBase(new Date());
          }}
        >
          月ごと
        </button>
      </div>

      <div className="day-nav">
        <button type="button" className="btn btn-sub" onClick={() => shift(-1)}>
          ◀ {mode === 'day' ? '前の日' : '前の月'}
        </button>
        <strong>{label}</strong>
        <button type="button" className="btn btn-sub" onClick={() => shift(1)} disabled={isCurrent}>
          {mode === 'day' ? '次の日' : '次の月'} ▶
        </button>
      </div>

      {places.length > 0 && (
        <div className="place-filter">
          <span className="label">販売場所</span>
          <div className="choice-row">
            <button
              type="button"
              className={`btn choice ${currentPlace === ALL ? 'selected' : ''}`}
              onClick={() => setPlace(ALL)}
            >
              すべての場所
            </button>
            {places.map((p) => (
              <button
                key={p || '(none)'}
                type="button"
                className={`btn choice ${currentPlace === p ? 'selected' : ''}`}
                onClick={() => setPlace(p)}
              >
                {p || '場所なし'}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="muted small">取消した取引は含みません。</p>
      <SummaryView data={data} mode={mode} showDevices={scope === 'all'} showLocations={currentPlace === ALL} />
    </div>
  );
}

function SummaryView({
  data,
  mode,
  showDevices,
  showLocations,
}: {
  data: SummaryData;
  mode: Mode;
  showDevices: boolean;
  showLocations: boolean;
}) {
  const maxAmount = Math.max(1, ...data.items.map((i) => i.amount));
  const paypayItems = data.items.filter((i) => i.paypayQty > 0).sort((a, b) => b.paypayAmount - a.paypayAmount);
  const when = (iso: string) => {
    const d = new Date(iso);
    return mode === 'day' ? formatTime(iso) : `${d.getMonth() + 1}/${d.getDate()} ${formatTime(iso)}`;
  };

  return (
    <>
      <div className="summary">
        <div className="metric">
          <span className="muted small">売上合計（{data.count}件）</span>
          <strong>{yen(data.cash + data.paypay)}</strong>
        </div>
        <div className="metric">
          <span className="muted small">現金</span>
          <strong>{yen(data.cash)}</strong>
        </div>
        <div className="metric metric-paypay">
          <span className="muted small">PayPay（{data.paypayCount}件）</span>
          <strong>{yen(data.paypay)}</strong>
        </div>
      </div>

      {showLocations && data.locations && data.locations.length > 0 && (
        <>
          <h2 className="section-title">販売場所ごとの売上</h2>
          <table className="sum-table">
            <thead>
              <tr>
                <th>販売場所</th>
                <th className="num">件数</th>
                <th className="num">金額</th>
              </tr>
            </thead>
            <tbody>
              {data.locations.map((l) => (
                <tr key={l.location || '(none)'}>
                  <td className="strong">{l.location || '場所なし'}</td>
                  <td className="num">{l.count}件</td>
                  <td className="num strong">{yen(l.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {showDevices && data.devices && data.devices.length > 0 && (
        <>
          <h2 className="section-title">端末ごとの売上</h2>
          <table className="sum-table">
            <thead>
              <tr>
                <th>端末</th>
                <th className="num">件数</th>
                <th className="num">金額</th>
              </tr>
            </thead>
            <tbody>
              {data.devices.map((d) => (
                <tr key={d.device}>
                  <td className="strong">{d.device}</td>
                  <td className="num">{d.count}件</td>
                  <td className="num strong">{yen(d.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h2 className="section-title">何が何個売れたか</h2>
      {data.items.length === 0 ? (
        <p className="empty">この期間の売上はありません</p>
      ) : (
        <table className="sum-table">
          <thead>
            <tr>
              <th>品名</th>
              <th className="num">個数</th>
              <th className="num">金額</th>
              <th className="num col-split">うち現金</th>
              <th className="num col-split">うちPayPay</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((i) => (
              <tr key={i.name}>
                <td>
                  <span className="item-name">{i.name}</span>
                  <span className="bar" style={{ width: `${(i.amount / maxAmount) * 100}%` }} />
                </td>
                <td className="num strong">{i.qty}個</td>
                <td className="num strong">{yen(i.amount)}</td>
                <td className="num col-split">{yen(i.cashAmount)}</td>
                <td className="num col-split">{yen(i.paypayAmount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>合計</td>
              <td className="num">{data.items.reduce((n, i) => n + i.qty, 0)}個</td>
              <td className="num">{yen(data.cash + data.paypay)}</td>
              <td className="num col-split">{yen(data.cash)}</td>
              <td className="num col-split">{yen(data.paypay)}</td>
            </tr>
          </tfoot>
        </table>
      )}

      <h2 className="section-title">PayPay売上の内訳</h2>
      <p className="muted small">PayPayの入金明細と照らし合わせるときに使います（日時・金額が明細と対応します）。</p>
      {data.paypaySales.length === 0 ? (
        <p className="empty">この期間のPayPay売上はありません</p>
      ) : (
        <div className="paypay-grid">
          <table className="sum-table">
            <thead>
              <tr>
                <th>品名</th>
                <th className="num">個数</th>
                <th className="num">金額</th>
              </tr>
            </thead>
            <tbody>
              {paypayItems.map((i) => (
                <tr key={i.name}>
                  <td>{i.name}</td>
                  <td className="num strong">{i.paypayQty}個</td>
                  <td className="num strong">{yen(i.paypayAmount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>PayPay合計</td>
                <td className="num">{paypayItems.reduce((n, i) => n + i.paypayQty, 0)}個</td>
                <td className="num">{yen(data.paypay)}</td>
              </tr>
            </tfoot>
          </table>

          <table className="sum-table">
            <thead>
              <tr>
                <th>日時</th>
                <th className="num">金額</th>
                <th>内容</th>
              </tr>
            </thead>
            <tbody>
              {data.paypaySales.map((s) => (
                <tr key={s.id}>
                  <td className="strong nowrap">
                    {when(s.createdAt)}
                    {s.device && <span className="device-name">{s.device}</span>}
                    {s.location && <span className="device-name">{s.location}</span>}
                  </td>
                  <td className="num strong">{yen(s.total)}</td>
                  <td className="muted">{s.items}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
