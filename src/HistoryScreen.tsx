import { useEffect, useState } from 'react';
import { db } from './db';
import type { Sale } from './types';
import { dayKey, formatTime, yen } from './util';

type Props = {
  onBack: () => void;
  onVoid: (id: string) => Promise<void>;
  onEdit: (sale: Sale) => void;
};

export function HistoryScreen({ onBack, onVoid, onEdit }: Props) {
  const [day, setDay] = useState(() => new Date());
  const [sales, setSales] = useState<Sale[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = async (d: Date) => {
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString();
    const rows = await db.sales.where('createdAt').between(start, end, true, false).toArray();
    setSales(rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  };

  useEffect(() => {
    load(day);
  }, [day]);

  const valid = sales.filter((s) => !s.voided);
  const cash = valid.filter((s) => s.method === 'cash').reduce((n, s) => n + s.total, 0);
  const paypay = valid.filter((s) => s.method === 'paypay').reduce((n, s) => n + s.total, 0);
  const isToday = dayKey(day) === dayKey(new Date());
  const shift = (n: number) => setDay(new Date(day.getFullYear(), day.getMonth(), day.getDate() + n));

  return (
    <div className="page">
      <div className="page-head">
        <button type="button" className="btn btn-sub" onClick={onBack}>
          ← レジに戻る
        </button>
        <h1>売上の履歴</h1>
        <span />
      </div>

      <div className="day-nav">
        <button type="button" className="btn btn-sub" onClick={() => shift(-1)}>
          ◀ 前の日
        </button>
        <strong>
          {day.getMonth() + 1}月{day.getDate()}日{isToday ? '（今日）' : ''}
        </strong>
        <button type="button" className="btn btn-sub" onClick={() => shift(1)} disabled={isToday}>
          次の日 ▶
        </button>
      </div>

      <div className="summary">
        <div className="metric">
          <span className="muted small">売上合計（{valid.length}件）</span>
          <strong>{yen(cash + paypay)}</strong>
        </div>
        <div className="metric">
          <span className="muted small">現金（レジに入っているはずの金額）</span>
          <strong>{yen(cash)}</strong>
        </div>
        <div className="metric">
          <span className="muted small">PayPay</span>
          <strong>{yen(paypay)}</strong>
        </div>
      </div>

      {sales.length === 0 && <p className="empty">この日の売上はありません</p>}
      <ul className="history">
        {sales.map((s) => (
          <li key={s.id} className={`history-row ${s.voided ? 'voided' : ''}`}>
            <div className="history-main">
              <span className="history-time">{formatTime(s.createdAt)}</span>
              <span className="history-items">
                {s.items.map((i) => `${i.name}×${i.qty}`).join('、')}
              </span>
            </div>
            <div className="history-side">
              <span className={`badge ${s.method}`}>{s.method === 'cash' ? '現金' : 'PayPay'}</span>
              <strong>{yen(s.total)}</strong>
              {s.voided ? (
                <span className="badge voided-badge">取消済み</span>
              ) : confirmId === s.id ? (
                <span className="confirm">
                  <button
                    type="button"
                    className="btn btn-del"
                    onClick={async () => {
                      await onVoid(s.id);
                      setConfirmId(null);
                      load(day);
                    }}
                  >
                    取り消す
                  </button>
                  <button type="button" className="btn btn-small" onClick={() => setConfirmId(null)}>
                    やめる
                  </button>
                </span>
              ) : (
                <>
                  <button type="button" className="btn btn-small" onClick={() => onEdit(s)}>
                    ✎ 修正
                  </button>
                  <button type="button" className="btn btn-small" onClick={() => setConfirmId(s.id)}>
                    取消
                  </button>
                </>
              )}
              {s.editedAt && !s.voided && <span className="badge edited">修正済み</span>}
              {!s.synced && <span className="badge unsent">未送信</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
