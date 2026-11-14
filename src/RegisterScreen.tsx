import { useMemo, useState } from 'react';
import type { CartLine, Product } from './types';
import { categoryColor, yen } from './util';

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

  return (
    <div className="register">
      <section className="products-pane" aria-label="商品">
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

      <section className="cart-pane" aria-label="お買い上げ">
        {props.editingLabel && (
          <div className="edit-banner">
            <span>✎ {props.editingLabel}</span>
            <button type="button" className="btn btn-small" onClick={props.onCancelEdit}>
              修正をやめる
            </button>
          </div>
        )}
        <div className="cart-head">
          <span>{props.editingLabel ? '修正後の内容' : 'お買い上げ'}</span>
          {cart.length > 0 && !props.editingLabel && (
            <button type="button" className="btn btn-small" onClick={props.onClearAll}>
              🗑 全部取り消す
            </button>
          )}
        </div>
        <div className="cart-lines">
          {cart.length === 0 && <p className="empty">左の商品を押すと、ここに追加されます</p>}
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
    </div>
  );
}
