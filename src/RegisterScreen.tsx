import { useEffect, useMemo, useRef, useState } from 'react';
import type { CartLine, Product } from './types';
import { COMPACT_QUERY, useMediaQuery } from './useMediaQuery';
import { categoryColor, dayKey, yen } from './util';

const POPULAR = '__popular__';

type Props = {
  products: Product[];
  cart: CartLine[];
  onTapProduct: (p: Product) => void;
  onTapOther: () => void;
  onChangeQty: (key: string, delta: number) => void;
  onEditPrice: (key: string) => void;
  onRemove: (key: string) => void;
  onClearAll: () => void;
  onPay: () => void;
  /** 履歴の取引を修正中なら、その説明（例「11:30の取引を修正中」） */
  editingLabel: string | null;
  onCancelEdit: () => void;
  /** 販売場所（空なら未設定） */
  locationName: string;
  /** 販売場所を選んだ日時（今日以外なら注意書きを出す）。修正中は null */
  locationSetAt: string | null;
  onPickLocation: () => void;
};

export function RegisterScreen(props: Props) {
  const { products, cart } = props;
  const visible = useMemo(
    () => products.filter((p) => p.visible).sort((a, b) => a.order - b.order),
    [products],
  );
  const categories = useMemo(() => [...new Set(visible.map((p) => p.category))], [visible]);
  const hasPopular = visible.some((p) => p.popular);
  const tabs = hasPopular ? [POPULAR, ...categories] : categories;
  const [tab, setTab] = useState<string>(tabs[0] ?? '');
  const current = tabs.includes(tab) ? tab : tabs[0];
  const shown = current === POPULAR ? visible.filter((p) => p.popular) : visible.filter((p) => p.category === current);

  const total = cart.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const count = cart.reduce((s, l) => s + l.qty, 0);

  // スマホでは明細を下のバーにまとめ、押すと全画面で開く
  const compact = useMediaQuery(COMPACT_QUERY);
  const [sheetOpen, setSheetOpen] = useState(() => !!props.editingLabel);
  // 商品を追加したとき、下のバーを一瞬光らせて「入った」ことを伝える
  const [flash, setFlash] = useState(false);
  const prevCount = useRef(count);
  useEffect(() => {
    if (count > prevCount.current) {
      setFlash(true);
      const t = window.setTimeout(() => setFlash(false), 500);
      prevCount.current = count;
      return () => window.clearTimeout(t);
    }
    prevCount.current = count;
  }, [count]);

  const editBanner = props.editingLabel && (
    <div className="edit-banner">
      <span>✎ {props.editingLabel}</span>
      <button type="button" className="btn btn-small" onClick={props.onCancelEdit}>
        修正をやめる
      </button>
    </div>
  );

  return (
    <div className={`register ${compact ? 'compact' : ''}`}>
      <section className="products-pane" aria-label="商品">
        {compact && editBanner}
        <LocationBar name={props.locationName} setAt={props.locationSetAt} onPick={props.onPickLocation} />
        <div className="tabs" role="tablist">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={t === current}
              className={`btn tab ${t === current ? 'on' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === POPULAR ? 'よく売れる' : t}
            </button>
          ))}
        </div>
        <div className="tiles">
          {shown.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`tile c-${categoryColor(p.category, categories)}`}
              onClick={() => props.onTapProduct(p)}
            >
              <span className="tile-name">{p.name}</span>
              <span className="tile-price">{p.variable ? '時価 ✎' : yen(p.price)}</span>
            </button>
          ))}
          <button type="button" className="tile tile-other" onClick={props.onTapOther}>
            <span className="tile-name">その他</span>
            <span className="tile-price">金額を入力</span>
          </button>
        </div>
      </section>

      {compact && !sheetOpen && (
        <div className={`cart-bar ${flash ? 'flash' : ''}`}>
          <button type="button" className="btn cart-bar-open" onClick={() => setSheetOpen(true)}>
            <span className="cart-bar-count">{count}点 ▲ 明細</span>
            <span className="cart-bar-total">{yen(total)}</span>
          </button>
          <button type="button" className="btn btn-go cart-bar-pay" onClick={props.onPay} disabled={cart.length === 0}>
            {props.editingLabel ? '確認へ →' : '会計へ →'}
          </button>
        </div>
      )}

      {(!compact || sheetOpen) && (
      <section className={`cart-pane ${compact ? 'cart-sheet' : ''}`} aria-label="お買い上げ">
        {editBanner}
        <div className="cart-head">
          {compact ? (
            <button type="button" className="btn btn-small" onClick={() => setSheetOpen(false)}>
              ▼ 商品を追加する
            </button>
          ) : (
            <span>{props.editingLabel ? '修正後の内容' : 'お買い上げ'}</span>
          )}
          {cart.length > 0 && !props.editingLabel && (
            <button type="button" className="btn btn-small" onClick={props.onClearAll}>
              🗑 全部取り消す
            </button>
          )}
        </div>
        <div className="cart-lines">
          {cart.length === 0 && (
            <p className="empty">{compact ? '「▼ 商品を追加する」から商品を追加してください' : '左の商品を押すと、ここに追加されます'}</p>
          )}
          {cart.map((l) => (
            <div key={l.key} className="line">
              <div className="line-top">
                <span className="line-name">
                  {l.name}{' '}
                  <button
                    type="button"
                    className="btn unit-price"
                    onClick={() => props.onEditPrice(l.key)}
                    aria-label={`${l.name}の単価を変更`}
                  >
                    @{l.unitPrice.toLocaleString('ja-JP')} ✎
                  </button>
                </span>
                <button type="button" className="btn btn-del" onClick={() => props.onRemove(l.key)}>
                  ✕ 削除
                </button>
              </div>
              <div className="line-bottom">
                <span className="qty">
                  <button
                    type="button"
                    className="btn qb"
                    onClick={() => props.onChangeQty(l.key, -1)}
                    aria-label="1つ減らす"
                  >
                    −
                  </button>
                  <span className="qty-num">{l.qty}</span>
                  <button
                    type="button"
                    className="btn qb"
                    onClick={() => props.onChangeQty(l.key, 1)}
                    aria-label="1つ増やす"
                  >
                    ＋
                  </button>
                </span>
                <span className="line-sub">{yen(l.unitPrice * l.qty)}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="cart-foot">
          <div className="total-row">
            <span className="muted">合計 {count}点</span>
            <span className="total">{yen(total)}</span>
          </div>
          <button type="button" className="btn btn-go btn-big" onClick={props.onPay} disabled={cart.length === 0}>
            {props.editingLabel ? '支払い方法の確認へ →' : '会計へ進む →'}
          </button>
        </div>
      </section>
      )}
    </div>
  );
}

/** レジ画面上部の販売場所。押すと場所を選ぶ画面が開く */
function LocationBar({ name, setAt, onPick }: { name: string; setAt: string | null; onPick: () => void }) {
  const stale = !!setAt && dayKey(new Date(setAt)) !== dayKey(new Date());
  const d = setAt ? new Date(setAt) : null;
  return (
    <button type="button" className={`btn location-bar ${name ? '' : 'unset'}`} onClick={onPick}>
      <span className="location-label">販売場所</span>
      <span className="location-name">{name || '未設定（押して選ぶ）'}</span>
      {stale && d && <span className="location-stale">{d.getMonth() + 1}/{d.getDate()}に選んだ場所</span>}
      <span className="location-change">変更 ▼</span>
    </button>
  );
}
