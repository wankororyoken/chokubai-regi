import { useEffect, useState } from 'react';
import { db } from './db';
import { fetchSummaryRemote, loadSavedSummary, type RemoteSummary } from './sync';
import type { Sale, SummaryData } from './types';
import { dayKey, formatDateTime, formatTime, yen } from './util';

type Props = { onBack: () => void };
type Mode = 'day' | 'month';
type Scope = 'local' | 'all';

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

/** この端末に保存されている売上から集計する */
function summarizeLocal(sales: Sale[]): SummaryData {
  const map = new Map<string, SummaryData['items'][number]>();
  let cash = 0;
  let paypay = 0;
  for (const s of sales) {
    if (s.method === 'cash') cash += s.total;
    else paypay += s.total;
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
      items: s.items.map((i) => `${i.name}×${i.qty}`).join('、'),
    }));
  return {
    count: sales.length,
    cash,
    paypay,
    paypayCount: paypaySales.length,
    items: [...map.values()].sort((a, b) => b.amount - a.amount),
    paypaySales,
  };
}

export function SummaryScreen({ onBack }: Props) {
  const [scope, setScope] = useState<Scope>('local');
  const [mode, setMode] = useState<Mode>('day');
  const [base, setBase] = useState(() => new Date());
  const [local, setLocal] = useState<SummaryData | null>(null);
  const [remote, setRemote] = useState<RemoteSummary | null>(null);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');

  const { start, end } = range(mode, base);
  const startKey = start.toISOString();

  // この端末の売上はすぐ集計。全端末は前回取得した結果があればそれを表示（自動では取りに行かない）
  useEffect(() => {
    setError('');
    if (scope === 'local') {
      db.sales
        .where('createdAt')
        .between(start.toISOString(), end.toISOString(), true, false)
        .toArray()
        .then((rows) =>
          setLocal(summarizeLocal(rows.filter((s) => !s.voided).sort((a, b) => a.createdAt.localeCompare(b.createdAt)))),
        );
    } else {
      setRemote(null);
      loadSavedSummary(start, end).then(setRemote);
    }
    // start/end は mode と base から決まるので、期間の変化は startKey で見る
  }, [scope, mode, startKey]);

  const fetchAll = async () => {
    setFetching(true);
    setError('');
    const r = await fetchSummaryRemote(start, end);
    setFetching(false);
    if (r.ok) setRemote(r.summary);
    else setError(r.message);
  };

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

  const data = scope === 'local' ? local : remote?.data ?? null;

  return (
    <div className="page">
      <div className="page-head">
        <button type="button" className="btn btn-sub" onClick={onBack}>
          ← レジに戻る
        </button>
        <h1>集計</h1>
        <span />
      </div>

      <div className="scope-switch" role="tablist" aria-label="集計する端末">
        <button
          type="button"
          role="tab"
          aria-selected={scope === 'local'}
          className={`btn choice ${scope === 'local' ? 'selected' : ''}`}
          onClick={() => setScope('local')}
        >
          この端末
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={scope === 'all'}
          className={`btn choice ${scope === 'all' ? 'selected' : ''}`}
          onClick={() => setScope('all')}
        >
          全端末
        </button>
      </div>

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

      {scope === 'all' && (
        <div className="fetch-panel">
          <div className="fetch-info">
            <span className="label">最終取得</span>
            <strong className="fetch-time">{remote ? formatDateTime(remote.fetchedAt) : 'まだ取得していません'}</strong>
          </div>
          <button type="button" className="btn btn-go" onClick={fetchAll} disabled={fetching}>
            {fetching ? '取得中…' : '⟳ 全端末の売上を取得'}
          </button>
          {error && <p className="error fetch-error">{error}</p>}
          <p className="muted small fetch-note">
            スプレッドシートに送られた売上を集計します。まだ同期していない端末の売上や、取得したあとの会計は、もう一度取得すると反映されます。
          </p>
        </div>
      )}

      {scope === 'local' && (
        <p className="muted small">この端末で会計した売上です（取消した取引は含みません）。</p>
      )}

      {data ? (
        <SummaryView data={data} mode={mode} showDevices={scope === 'all'} />
      ) : (
        scope === 'all' && !fetching && <p className="empty">「全端末の売上を取得」を押すと、この期間の集計が表示されます</p>
      )}
    </div>
  );
}

function SummaryView({ data, mode, showDevices }: { data: SummaryData; mode: Mode; showDevices: boolean }) {
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
