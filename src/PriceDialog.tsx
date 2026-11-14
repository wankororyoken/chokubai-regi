import { useState } from 'react';
import { Keypad } from './Keypad';
import { yen } from './util';

type Props = {
  title: string;
  hint?: string;
  initial: number | null;
  presets: number[];
  confirmLabel: string;
  onConfirm: (price: number) => void;
  onCancel: () => void;
};

/** 時価の商品・単価の変更・「その他」の金額入力で使う画面 */
export function PriceDialog({ title, hint, initial, presets, confirmLabel, onConfirm, onCancel }: Props) {
  const [value, setValue] = useState(initial ? String(initial) : '');
  const [error, setError] = useState('');
  const price = Number(value || 0);

  const confirm = () => {
    if (price <= 0) {
      setError('金額を入れてください');
      return;
    }
    onConfirm(price);
  };

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <h2 className="dialog-title">{title}</h2>
        {hint && <p className="muted small">{hint}</p>}
        {presets.length > 0 && (
          <>
            <p className="label">よく使う価格</p>
            <div className="presets">
              {presets.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`btn preset ${price === p ? 'selected' : ''}`}
                  onClick={() => {
                    setValue(String(p));
                    setError('');
                  }}
                >
                  {yen(p)}
                </button>
              ))}
            </div>
          </>
        )}
        <p className="label">{presets.length > 0 ? 'それ以外は数字で入力' : '金額を数字で入力'}</p>
        <div className="input-box">{value ? yen(price) : <span className="placeholder">0円</span>}</div>
        {error && <p className="error">{error}</p>}
        <Keypad
          value={value}
          onChange={(v) => {
            setValue(v);
            setError('');
          }}
        />
        <div className="dialog-actions">
          <button type="button" className="btn btn-sub" onClick={onCancel}>
            やめる
          </button>
          <button type="button" className="btn btn-go" onClick={confirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
