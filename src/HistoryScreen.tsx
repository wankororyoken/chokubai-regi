import { useEffect, useState } from 'react';
import { RemotePanel, type Scope } from './RemotePanel';
import { loadSales, type ListedSale } from './salesData';
import type { Sale } from './types';
import { dayKey, formatDateTime, formatTime, yen } from './util';

type Props = {
  onBack: () => void;
  onVoid: (id: string) => Promise<void>;
  onEdit: (sale: Sale) => void;
};

export function HistoryScreen({ onBack, onVoid, onEdit }: Props) {
  const [day, setDay] = useState(() => new Date());
  const [scope, setScope] = useState<Scope>('all');
  const [sales, setSales] = useState<ListedSale[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);

  const load = async () => {
    const rows = await loadSales(start, end, scope === 'all');
    setSales(rows.reverse());
  };

  useEffect(() => {
    load();
    // 日付と表示する端末が変わったら読み直す
  }, [day, scope]);

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

      <RemotePanel scope={scope} onScope={setScope} start={start} end={end} onFetched={load} />

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
          <span className="muted small">{scope === 'local' ? '現金（この端末のレジに入っているはずの金額）' : '現金'}</span>
          <strong>{yen(cash)}</strong>
        </div>
        <div className="metric">
          <span className="muted small">PayPay</span>
          <strong>{yen(paypay)}</strong>
        </div>
      </div>

      {sales.length === 0 && <p className="empty">この日の売上はありません</p>}
      <p className="muted small">取引を押すと、明細（単価・数量・預かり・おつり）が開きます。</p>
      <ul className="history">
        {sales.map((s) => {
          const open = openId === s.id;
          const local = !s.remote ? (s as Sale & { remote: boolean }) : null;
          return (
            <li key={s.id} className={`history-row ${s.voided ? 'voided' : ''} ${s.remote ? 'remote' : ''}`}>
              <button
                type="button"
                className="history-main history-toggle"
                onClick={() => setOpenId(open ? null : s.id)}
                aria-expanded={open}
              >
                <span className="history-time">{formatTime(s.createdAt)}</span>
                <span className="history-text">
                  <span className="history-items">{s.items.map((i) => `${i.name}×${i.qty}`).join('、')}</span>
                  <span className="history-tags">
                    <span className={`tag ${s.remote ? 'tag-remote' : 'tag-local'}`}>
                      {s.remote ? s.device || '他の端末' : 'この端末'}
                    </span>
                    <span className="tag">{s.location ? `📍 ${s.location}` : '場所なし'}</span>
                  </span>
                </span>
                <span className="history-open">{open ? '▲' : '▼'}</span>
              </button>
              <div className="history-side">
                <span className={`badge ${s.method}`}>{s.method === 'cash' ? '現金' : 'PayPay'}</span>
                <strong>{yen(s.total)}</strong>
                {s.voided ? (
                  <span className="badge voided-badge">取消済み</span>
                ) : !local ? null : confirmId === s.id ? (
                  <span className="confirm">
                    <button
                      type="button"
                      className="btn btn-del"
                      onClick={async () => {
                        await onVoid(s.id);
                        setConfirmId(null);
                        load();
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
                    <button type="button" className="btn btn-small" onClick={() => onEdit(local)}>
                      ✎ 修正
                    </button>
                    <button type="button" className="btn btn-small" onClick={() => setConfirmId(s.id)}>
                      取消
                    </button>
                  </>
                )}
                {s.editedAt && !s.voided && <span className="badge edited">修正済み</span>}
                {local && !local.synced && <span className="badge unsent">未送信</span>}
              </div>

              {open && (
                <div className="history-detail">
                  <table className="detail-table">
                    <tbody>
                      {s.items.map((i, idx) => (
                        <tr key={idx}>
                          <td>{i.name}</td>
                          <td className="num">
                            {yen(i.unitPrice)} × {i.qty}
                          </td>
                          <td className="num strong">{yen(i.subtotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <dl className="detail-meta">
                    {s.method === 'cash' && (
                      <>
                        <dt>預かり</dt>
                        <dd>{yen(s.received)}</dd>
                        <dt>おつり</dt>
                        <dd>{yen(s.change)}</dd>
                      </>
                    )}
                    <dt>端末</dt>
                    <dd>{s.device || '—'}</dd>
                    <dt>販売場所</dt>
                    <dd>{s.location || '未設定'}</dd>
                    {s.editedAt && (
                      <>
                        <dt>修正</dt>
                        <dd>{formatDateTime(s.editedAt)}</dd>
                      </>
                    )}
                  </dl>
                  {s.remote && <p className="muted small">他の端末の取引は、会計した端末で修正・取消できます。</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
