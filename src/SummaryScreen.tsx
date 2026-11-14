import { useEffect, useMemo, useState } from 'react';
import { db } from './db';
import type { Sale } from './types';
import { dayKey, formatTime, yen } from './util';

type Props = { onBack: () => void };
type Mode = 'day' | 'month';

type ItemRow = { name: string; qty: number; amount: number; cashAmount: number; paypayAmount: number; paypayQty: number };

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

export function SummaryScreen({ onBack }: Props) {
  const [mode, setMode] = useState<Mode>('day');
  const [base, setBase] = useState(() => new Date());
  const [sales, setSales] = useState<Sale[]>([]);

  useEffect(() => {
    const { start, end } = range(mode, base);
    db.sales
      .where('createdAt')
      .between(start.toISOString(), end.toISOString(), true, false)
      .toArray()
      .then((rows) => setSales(rows.filter((s) => !s.voided).sort((a, b) => a.createdAt.localeCompare(b.createdAt))));
  }, [mode, base]);

  const { items, cash, paypay, paypaySales } = useMemo(() => {
    const map = new Map<string, ItemRow>();
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
    const items = [...map.values()].sort((a, b) => b.amount - a.amount);
    return { items, cash, paypay, paypaySales: sales.filter((s) => s.method === 'paypay') };
  }, [sales]);

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
  const maxAmount = Math.max(1, ...items.map((i) => i.amount));
  const paypayItems = items.filter((i) => i.paypayQty > 0).sort((a, b) => b.paypayAmount - a.paypayAmount);
  const when = (iso: string) => {
    const d = new Date(iso);
    return mode === 'day' ? formatTime(iso) : `${d.getMonth() + 1}/${d.getDate()} ${formatTime(iso)}`;
  };

  return (
    <div className="page">
      <div className="page-head">
        <button type="button" className="btn btn-sub" onClick={onBack}>
          ← レジに戻る
        </button>
        <h1>集計</h1>
        <span />
      </div>

      <div className="mode-switch" role="tablist">
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

      <div className="summary">
        <div className="metric">
          <span className="muted small">売上合計（{sales.length}件）</span>
          <strong>{yen(cash + paypay)}</strong>
        </div>
        <div className="metric">
          <span className="muted small">現金</span>
          <strong>{yen(cash)}</strong>
        </div>
        <div className="metric metric-paypay">
          <span className="muted small">PayPay（{paypaySales.length}件）</span>
          <strong>{yen(paypay)}</strong>
        </div>
      </div>
      <p className="muted small">この端末で会計した売上です（取消した取引は含みません）。全端末の合計はスプレッドシートで確認できます。</p>

      <h2 className="section-title">何が何個売れたか</h2>
      {items.length === 0 ? (
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
            {items.map((i) => (
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
              <td className="num">{items.reduce((n, i) => n + i.qty, 0)}個</td>
              <td className="num">{yen(cash + paypay)}</td>
              <td className="num col-split">{yen(cash)}</td>
              <td className="num col-split">{yen(paypay)}</td>
            </tr>
          </tfoot>
        </table>
      )}

      <h2 className="section-title">PayPay売上の内訳</h2>
      <p className="muted small">PayPayの入金明細と照らし合わせるときに使います（日時・金額が明細と対応します）。</p>
      {paypaySales.length === 0 ? (
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
                <td className="num">{yen(paypay)}</td>
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
              {paypaySales.map((s) => (
                <tr key={s.id}>
                  <td className="strong nowrap">{when(s.createdAt)}</td>
                  <td className="num strong">{yen(s.total)}</td>
                  <td className="muted">{s.items.map((i) => `${i.name}×${i.qty}`).join('、')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
