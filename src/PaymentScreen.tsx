import { useState } from 'react';
import { Keypad } from './Keypad';
import type { PayMethod } from './types';
import { yen } from './util';

type Props = {
  total: number;
  initialMethod: PayMethod;
  initialReceived: number | null;
  /** 履歴の取引を修正しているとき true */
  editing: boolean;
  onBack: () => void;
  onComplete: (method: PayMethod, received: number) => void;
};

const bills = [1000, 2000, 5000, 10000];

export function PaymentScreen({ total, initialMethod, initialReceived, editing, onBack, onComplete }: Props) {
  const [method, setMethod] = useState<PayMethod>(initialMethod);
  const [received, setReceived] = useState(initialReceived ? String(initialReceived) : '');
  const receivedNum = Number(received || 0);
  const change = receivedNum - total;
  const short = method === 'cash' && (received === '' || change < 0);

  let completeLabel = editing ? '修正を保存する' : '会計を完了する';
  if (method === 'cash' && received === '') completeLabel = '受け取った金額を入れてください';
  else if (method === 'cash' && change < 0) completeLabel = `あと ${yen(-change)} 足りません`;
  else if (method === 'paypay') completeLabel = editing ? '修正を保存する' : 'PayPayの支払いを確認した';

  return (
    <div className="payment">
      <section className="pay-left">
        <p className="label">{editing ? '修正後のお会計' : 'お会計'}</p>
        <p className="pay-total">{yen(total)}</p>

        <p className="label">1. 支払い方法を選ぶ</p>
        <div className="methods">
          <button
            type="button"
            className={`btn method ${method === 'cash' ? 'selected' : ''}`}
            onClick={() => setMethod('cash')}
          >
            {method === 'cash' ? '✔ ' : ''}現金
          </button>
          <button
            type="button"
            className={`btn method ${method === 'paypay' ? 'selected' : ''}`}
            onClick={() => setMethod('paypay')}
          >
            {method === 'paypay' ? '✔ ' : ''}PayPay
          </button>
        </div>

        {method === 'cash' ? (
          <>
            <p className="label">受け取った金額</p>
            <div className="input-box input-active">
              {received ? yen(receivedNum) : <span className="placeholder">右で入力 →</span>}
              <span className="caret" />
            </div>
            {received === '' ? (
              <div className="change-box neutral">
                <span>おつり</span>
                <span className="change-num">—</span>
              </div>
            ) : change >= 0 ? (
              <div className="change-box ok">
                <span>おつり</span>
                <span className="change-num">{yen(change)}</span>
              </div>
            ) : (
              <div className="change-box ng">
                <span>足りません</span>
                <span className="change-num">あと {yen(-change)}</span>
              </div>
            )}
          </>
        ) : (
          <div className="paypay-note">
            お客様のPayPay画面で
            <br />
            <strong>{yen(total)}</strong> の支払い完了を
            <br />
            確認してから下のボタンを押してください
          </div>
        )}

        <button
          type="button"
          className="btn btn-go btn-big"
          disabled={short}
          onClick={() => onComplete(method, method === 'cash' ? receivedNum : total)}
        >
          {completeLabel}
        </button>
        <button type="button" className="btn btn-sub btn-back" onClick={onBack}>
          ← レジ画面に戻る
        </button>
      </section>

      {method === 'cash' && (
        <section className="pay-right">
          <p className="label">2. 受け取った金額を入れる</p>
          <p className="muted small">お札・ちょうどの時はワンタッチ</p>
          <div className="quick">
            <button type="button" className="btn quick-btn" onClick={() => setReceived(String(total))}>
              ちょうど
            </button>
            {bills.map((b) => (
              <button key={b} type="button" className="btn quick-btn" onClick={() => setReceived(String(b))}>
                {yen(b)}
              </button>
            ))}
          </div>
          <p className="muted small">それ以外は数字で入力（1,500円 → 1 5 0 0）</p>
          <Keypad value={received} onChange={setReceived} />
        </section>
      )}
    </div>
  );
}
