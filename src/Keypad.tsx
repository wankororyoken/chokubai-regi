type Props = {
  value: string;
  onChange: (v: string) => void;
  maxDigits?: number;
};

const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '00'];

/** 金額入力用のテンキー。value は数字だけの文字列 */
export function Keypad({ value, onChange, maxDigits = 6 }: Props) {
  const press = (k: string) => {
    // 先頭の 0 は付けない（空のまま 0 を押しても空のまま）
    const next = (value + k).replace(/^0+/, '');
    if (next.length > maxDigits) return;
    onChange(next);
  };
  return (
    <div className="keypad">
      {keys.map((k) => (
        <button key={k} type="button" className="btn key" onClick={() => press(k)}>
          {k}
        </button>
      ))}
      <button type="button" className="btn key key-back" onClick={() => onChange(value.slice(0, -1))}>
        1字消す
      </button>
    </div>
  );
}
