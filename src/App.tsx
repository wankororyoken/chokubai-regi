import { useCallback, useEffect, useRef, useState } from 'react';
import { db, getMeta } from './db';
import { HistoryScreen } from './HistoryScreen';
import { LocationDialog } from './LocationDialog';
import { PaymentScreen } from './PaymentScreen';
import { PriceDialog } from './PriceDialog';
import { ProductsScreen } from './ProductsScreen';
import { RegisterScreen } from './RegisterScreen';
import { sampleProducts } from './sampleProducts';
import { SettingsScreen } from './SettingsScreen';
import { SummaryScreen } from './SummaryScreen';
import { getCurrentLocation, setCurrentLocation } from './salesData';
import { loadSettings, syncNow } from './sync';
import type { CartLine, CurrentLocation, PayMethod, Product, Sale } from './types';
import { formatDateTime, formatTime, uid, yen } from './util';

type Screen = 'register' | 'payment' | 'history' | 'summary' | 'settings' | 'products';

type PriceTarget =
  | { kind: 'add'; product: Product }
  | { kind: 'edit'; key: string }
  | { kind: 'other' };

type Toast = { message: string; undo?: () => void; error?: boolean };

const CART_KEY = 'regi-cart';
const STALE_MS = 24 * 60 * 60 * 1000;

function loadCart(): CartLine[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('register');
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartLine[]>(loadCart);
  const [priceTarget, setPriceTarget] = useState<PriceTarget | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  /** 履歴から取引を修正中のとき：元の取引と、修正前に入力していた明細 */
  const [editing, setEditing] = useState<{ sale: Sale; savedCart: CartLine[]; location: string } | null>(null);
  /** レジで選んでいる販売場所（一度選ぶと、変えるまで次の会計にも引き継ぐ） */
  const [location, setLocation] = useState<CurrentLocation | null>(null);
  const [pickingLocation, setPickingLocation] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number>();

  const [online, setOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [unsent, setUnsent] = useState(0);
  const [lastMasterAt, setLastMasterAt] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const lastPrices = useRef<Record<string, number>>({});

  const showToast = useCallback((t: Toast) => {
    window.clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = window.setTimeout(() => setToast(null), t.undo ? 6000 : 4000);
  }, []);

  const refreshStatus = useCallback(async () => {
    setUnsent(await db.sales.where('synced').equals(0).count());
    setLastMasterAt(await getMeta<string | null>('lastMasterAt', null));
    setLastSyncAt(await getMeta<string | null>('lastSyncAt', null));
    lastPrices.current = await getMeta<Record<string, number>>('lastPrices', {});
  }, []);

  const reloadProducts = useCallback(async () => {
    let rows = await db.products.toArray();
    if (rows.length === 0) {
      await db.products.bulkPut(sampleProducts);
      rows = sampleProducts;
    }
    setProducts(rows);
  }, []);

  const runSync = useCallback(
    async (manual: boolean, pull = true) => {
      if (!manual) {
        const s = await loadSettings();
        if (!s.gasUrl || !navigator.onLine) return;
      }
      setSyncing(true);
      const r = await syncNow({ pull });
      setSyncing(false);
      if (r.ok) await reloadProducts();
      await refreshStatus();
      // 自動同期の失敗は通知しない（会計完了の表示を消さないため）。未送信件数は上部に出ている
      if (manual) showToast({ message: r.message, error: !r.ok });
    },
    [reloadProducts, refreshStatus, showToast],
  );

  // 起動時：保存データを読み込み、つながっていれば裏で同期
  useEffect(() => {
    navigator.storage?.persist?.().catch(() => undefined);
    reloadProducts();
    getCurrentLocation().then(setLocation);
    refreshStatus().then(() => runSync(false));
    const on = () => {
      setOnline(true);
      runSync(false);
    };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [reloadProducts, refreshStatus, runSync]);

  // 画面を閉じても入力中の明細が消えないよう保存
  useEffect(() => {
    try {
      // 修正中は、修正前に入力していた明細のほうを保存（途中で閉じても新しい会計にならないように）
      localStorage.setItem(CART_KEY, JSON.stringify(editing ? editing.savedCart : cart));
    } catch {
      /* 保存できなくても会計は続けられる */
    }
  }, [cart, editing]);

  const addLine = (p: { id: string | null; name: string; category: string; variable: boolean }, price: number) => {
    setCart((c) => {
      const i = c.findIndex((l) => l.productId === p.id && p.id !== null && l.unitPrice === price);
      if (i >= 0) return c.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l));
      return [
        ...c,
        { key: uid(), productId: p.id, name: p.name, category: p.category, unitPrice: price, qty: 1, variable: p.variable },
      ];
    });
  };

  const rememberPrice = (productId: string, price: number) => {
    lastPrices.current = { ...lastPrices.current, [productId]: price };
    db.meta.put({ key: 'lastPrices', value: lastPrices.current });
  };

  const onTapProduct = (p: Product) => {
    if (p.variable) setPriceTarget({ kind: 'add', product: p });
    else addLine(p, p.price);
  };

  const onRemove = (key: string) => {
    const index = cart.findIndex((l) => l.key === key);
    if (index < 0) return;
    const line = cart[index];
    setCart(cart.filter((l) => l.key !== key));
    showToast({
      message: `${line.name}を削除しました`,
      undo: () =>
        setCart((c) => {
          const next = [...c];
          next.splice(Math.min(index, next.length), 0, line);
          return next;
        }),
    });
  };

  const total = cart.reduce((s, l) => s + l.unitPrice * l.qty, 0);

  const completeSale = async (method: PayMethod, received: number) => {
    const items = cart.map((l) => ({
      productId: l.productId,
      name: l.name,
      unitPrice: l.unitPrice,
      qty: l.qty,
      subtotal: l.unitPrice * l.qty,
    }));

    if (editing) {
      const orig = editing.sale;
      await db.sales.update(orig.id, {
        method,
        total,
        received,
        change: received - total,
        items,
        location: editing.location,
        editedAt: new Date().toISOString(),
        rev: (orig.rev ?? 0) + 1,
        synced: 0,
      });
      setCart(editing.savedCart);
      setEditing(null);
      setScreen('history');
      showToast({ message: `${formatTime(orig.createdAt)}の取引を修正しました` });
      refreshStatus();
      return;
    }

    const settings = await loadSettings();
    const sale: Sale = {
      id: uid(),
      createdAt: new Date().toISOString(),
      device: settings.deviceName,
      method,
      total,
      received,
      change: received - total,
      voided: false,
      items,
      location: location?.name ?? '',
      rev: 0,
      synced: 0,
    };
    await db.sales.add(sale);
    setCart([]);
    setScreen('register');
    showToast({
      message: method === 'cash' ? `会計完了　おつり ${yen(sale.change)}` : `会計完了（PayPay ${yen(total)}）`,
    });
    refreshStatus();
    // 会計直後の自動同期は売上を送るだけ（他の端末の取引は受け取らず、通信を軽くする）
    if (navigator.onLine) runSync(false, false);
  };

  const startEdit = (sale: Sale) => {
    setEditing({ sale, savedCart: cart, location: sale.location ?? '' });
    setCart(
      sale.items.map((i) => ({
        key: uid(),
        productId: i.productId,
        name: i.name,
        category: products.find((p) => p.id === i.productId)?.category ?? 'その他',
        unitPrice: i.unitPrice,
        qty: i.qty,
        variable: products.find((p) => p.id === i.productId)?.variable ?? true,
      })),
    );
    setToast(null);
    setScreen('register');
  };

  const cancelEdit = () => {
    if (!editing) return;
    setCart(editing.savedCart);
    setEditing(null);
    setScreen('history');
  };

  const voidSale = async (id: string) => {
    const s = await db.sales.get(id);
    if (!s) return;
    await db.sales.update(id, { voided: true, rev: (s.rev ?? 0) + 1, synced: 0 });
    refreshStatus();
  };

  const masterStale = !lastMasterAt || Date.now() - new Date(lastMasterAt).getTime() > STALE_MS;

  // 時価・単価変更ダイアログの中身
  let dialog = null;
  if (priceTarget) {
    if (priceTarget.kind === 'add') {
      const p = priceTarget.product;
      const last = lastPrices.current[p.id];
      dialog = (
        <PriceDialog
          title={`${p.name} の価格`}
          hint={last ? `前回 ${yen(last)}` : undefined}
          initial={last ?? (p.price || null)}
          presets={p.presets}
          confirmLabel="追加する"
          onCancel={() => setPriceTarget(null)}
          onConfirm={(price) => {
            addLine(p, price);
            rememberPrice(p.id, price);
            setPriceTarget(null);
          }}
        />
      );
    } else if (priceTarget.kind === 'edit') {
      const line = cart.find((l) => l.key === priceTarget.key);
      const product = products.find((p) => p.id === line?.productId);
      if (line)
        dialog = (
          <PriceDialog
            title={`${line.name} の単価を変更`}
            hint="この会計だけの変更です（商品マスタは変わりません）"
            initial={line.unitPrice}
            presets={product?.presets ?? []}
            confirmLabel="変更する"
            onCancel={() => setPriceTarget(null)}
            onConfirm={(price) => {
              setCart((c) => c.map((l) => (l.key === line.key ? { ...l, unitPrice: price } : l)));
              setPriceTarget(null);
            }}
          />
        );
    } else {
      dialog = (
        <PriceDialog
          title="その他の商品"
          hint="リストにない商品の金額を入れます"
          initial={null}
          presets={[]}
          confirmLabel="追加する"
          onCancel={() => setPriceTarget(null)}
          onConfirm={(price) => {
            addLine({ id: null, name: 'その他', category: 'その他', variable: true }, price);
            setPriceTarget(null);
          }}
        />
      );
    }
  }

  return (
    <div className="app">
      <header className="header">
        <span className="brand">直売所レジ</span>
        <span className="status">
          <span className={online ? 'st-online' : 'st-offline'}>{online ? '● オンライン' : '● オフライン'}</span>
          <span className={masterStale ? 'st-warn' : ''}>商品データ 最終更新 {formatDateTime(lastMasterAt)}</span>
          <span className={unsent > 0 ? 'st-warn' : 'st-ok'}>
            {unsent > 0 ? `売上 未送信 ${unsent}件` : lastSyncAt ? '売上 送信済み' : '売上 未送信なし'}
          </span>
        </span>
        {screen === 'register' && !editing && (
          <span className="header-actions">
            <button type="button" className="btn btn-small" onClick={() => runSync(true)} disabled={syncing}>
              {syncing ? '同期中…' : '⟳ 同期'}
            </button>
            <button type="button" className="btn btn-small" onClick={() => setScreen('history')}>
              履歴
            </button>
            <button type="button" className="btn btn-small" onClick={() => setScreen('summary')}>
              集計
            </button>
            <button type="button" className="btn btn-small" onClick={() => setScreen('settings')}>
              設定
            </button>
          </span>
        )}
      </header>

      <main className="main">
        {screen === 'register' && (
          <RegisterScreen
            products={products}
            cart={cart}
            onTapProduct={onTapProduct}
            editingLabel={editing ? `${formatTime(editing.sale.createdAt)}の取引を修正中` : null}
            locationName={editing ? editing.location : location?.name ?? ''}
            locationSetAt={editing ? null : location?.setAt ?? null}
            onPickLocation={() => setPickingLocation(true)}
            onCancelEdit={cancelEdit}
            onTapOther={() => setPriceTarget({ kind: 'other' })}
            onChangeQty={(key, d) =>
              setCart((c) => c.map((l) => (l.key === key ? { ...l, qty: Math.max(1, Math.min(99, l.qty + d)) } : l)))
            }
            onEditPrice={(key) => setPriceTarget({ kind: 'edit', key })}
            onRemove={onRemove}
            onClearAll={() => setConfirmClear(true)}
            onPay={() => {
              if (cart.length === 0) return;
              setToast(null); // 会計中に「元に戻す」で明細が変わらないよう消しておく
              setScreen('payment');
            }}
          />
        )}
        {screen === 'payment' && (
          <PaymentScreen
            key={editing?.sale.id ?? 'new'}
            total={total}
            initialMethod={editing?.sale.method ?? 'cash'}
            initialReceived={editing && editing.sale.method === 'cash' ? editing.sale.received : null}
            editing={!!editing}
            onBack={() => setScreen('register')}
            onComplete={completeSale}
          />
        )}
        {screen === 'history' && (
          <HistoryScreen onBack={() => setScreen('register')} onVoid={voidSale} onEdit={startEdit} />
        )}
        {screen === 'summary' && <SummaryScreen onBack={() => setScreen('register')} />}
        {screen === 'products' && (
          <ProductsScreen
            products={products}
            online={online}
            onBack={() => setScreen('settings')}
            onSaved={async () => {
              await reloadProducts();
              await refreshStatus();
            }}
            onMessage={(message, error) => showToast({ message, error })}
          />
        )}
        {screen === 'settings' && (
          <SettingsScreen
            onBack={() => setScreen('register')}
            onSync={() => runSync(true)}
            syncing={syncing}
            onOpenProducts={() => setScreen('products')}
          />
        )}
      </main>

      {dialog}

      {pickingLocation && (
        <LocationDialog
          current={editing ? editing.location : location?.name ?? ''}
          editingLabel={editing ? `${formatTime(editing.sale.createdAt)}の取引` : null}
          onCancel={() => setPickingLocation(false)}
          onSelect={(name) => {
            setPickingLocation(false);
            if (editing) {
              setEditing({ ...editing, location: name });
              return;
            }
            const next = name ? { name, setAt: new Date().toISOString() } : null;
            setLocation(next);
            setCurrentLocation(next);
            showToast({ message: name ? `販売場所を「${name}」にしました` : '販売場所を未設定にしました' });
          }}
        />
      )}

      {confirmClear && (
        <div className="overlay" onClick={() => setConfirmClear(false)}>
          <div className="dialog dialog-small" onClick={(e) => e.stopPropagation()} role="alertdialog">
            <h2 className="dialog-title">お買い上げ {cart.reduce((s, l) => s + l.qty, 0)}点をすべて取り消しますか？</h2>
            <div className="dialog-actions">
              <button type="button" className="btn btn-sub" onClick={() => setConfirmClear(false)}>
                やめる
              </button>
              <button
                type="button"
                className="btn btn-del btn-del-big"
                onClick={() => {
                  setCart([]);
                  setConfirmClear(false);
                }}
              >
                すべて取り消す
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast ${toast.error ? 'toast-error' : ''}`} role="status">
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              type="button"
              className="btn btn-small"
              onClick={() => {
                toast.undo?.();
                setToast(null);
              }}
            >
              元に戻す
            </button>
          )}
        </div>
      )}
    </div>
  );
}
