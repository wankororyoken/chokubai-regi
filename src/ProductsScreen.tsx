import { useMemo, useState } from 'react';
import { saveProductsRemote } from './sync';
import type { Product } from './types';
import { yen } from './util';

type Props = {
  products: Product[];
  online: boolean;
  onBack: () => void;
  /** 保存に成功したあと、画面の商品一覧を読み直す */
  onSaved: () => Promise<void>;
  onMessage: (message: string, error?: boolean) => void;
};

const DEFAULT_CATEGORIES = ['野菜', '卵', '果物', '加工品', 'その他'];

export function ProductsScreen({ products, online, onBack, onSaved, onMessage }: Props) {
  const [editing, setEditing] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);

  const sorted = useMemo(() => [...products].sort((a, b) => a.order - b.order), [products]);
  const categories = useMemo(() => {
    const used = [...new Set(sorted.map((p) => p.category))];
    return [...used, ...DEFAULT_CATEGORIES.filter((c) => !used.includes(c))];
  }, [sorted]);
  const groups = categories
    .map((c) => ({ category: c, items: sorted.filter((p) => p.category === c) }))
    .filter((g) => g.items.length > 0);

  const save = async (upserts: Product[], deletes: string[] = []) => {
    setSaving(true);
    const r = await saveProductsRemote(upserts, deletes);
    setSaving(false);
    onMessage(r.message, !r.ok);
    if (r.ok) await onSaved();
    return r.ok;
  };

  /** 同じ区分の中で1つ上（-1）か下（+1）と入れ替える */
  const move = async (p: Product, dir: -1 | 1) => {
    const list = sorted.map((x, i) => ({ ...x, order: i + 1 }));
    const same = list.filter((x) => x.category === p.category);
    const i = same.findIndex((x) => x.id === p.id);
    const other = same[i + dir];
    if (!other) return;
    const me = same[i];
    [me.order, other.order] = [other.order, me.order];
    const changed = list.filter((x) => products.find((o) => o.id === x.id)?.order !== x.order);
    await save(changed);
  };

  const newProduct = (): Product => ({
    id: '',
    name: '',
    category: categories[0] ?? '野菜',
    price: 0,
    variable: false,
    presets: [],
    order: Math.max(0, ...products.map((p) => p.order)) + 1,
    visible: true,
    popular: false,
  });

  if (editing) {
    return (
      <ProductForm
        initial={editing}
        categories={categories}
        saving={saving}
        online={online}
        onCancel={() => setEditing(null)}
        onSave={async (p) => {
          if (await save([p])) setEditing(null);
        }}
        onDelete={async () => {
          if (await save([], [editing.id])) setEditing(null);
        }}
      />
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <button type="button" className="btn btn-sub" onClick={onBack}>
          ← 戻る
        </button>
        <h1>商品の管理</h1>
        <button type="button" className="btn btn-go" onClick={() => setEditing(newProduct())}>
          ＋ 追加
        </button>
      </div>

      {!online && (
        <p className="notice-warn">オフラインです。商品の変更はインターネットにつながっているときに保存できます。</p>
      )}
      <p className="muted small">
        ここで保存した内容はスプレッドシートの「商品マスタ」に書き込まれ、他の端末には次の同期で反映されます。
      </p>

      {groups.map((g) => (
        <section key={g.category}>
          <h2 className="section-title">{g.category}</h2>
          <ul className="plist">
            {g.items.map((p, i) => (
              <li key={p.id} className={`prow ${p.visible ? '' : 'hidden-item'}`}>
                <div className="prow-main">
                  <span className="prow-name">{p.name}</span>
                  <span className="prow-meta">
                    {p.variable ? `時価${p.presets.length ? `（${p.presets.join('・')}円）` : ''}` : yen(p.price)}
                    {p.popular && <span className="badge edited">よく売れる</span>}
                    {!p.visible && <span className="badge voided-badge">非表示</span>}
                  </span>
                </div>
                <div className="prow-actions">
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={i === 0 || saving}
                    onClick={() => move(p, -1)}
                    aria-label={`${p.name}を上へ`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={i === g.items.length - 1 || saving}
                    onClick={() => move(p, 1)}
                    aria-label={`${p.name}を下へ`}
                  >
                    ↓
                  </button>
                  <button type="button" className="btn btn-small" onClick={() => setEditing(p)}>
                    ✎ 編集
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

type FormProps = {
  initial: Product;
  categories: string[];
  saving: boolean;
  online: boolean;
  onCancel: () => void;
  onSave: (p: Product) => void;
  onDelete: () => void;
};

function ProductForm({ initial, categories, saving, online, onCancel, onSave, onDelete }: FormProps) {
  const [p, setP] = useState<Product>(initial);
  const [priceText, setPriceText] = useState(initial.price ? String(initial.price) : '');
  const [newCategory, setNewCategory] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [presetText, setPresetText] = useState('');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isNew = !initial.id;
  const set = (patch: Partial<Product>) => {
    setP((prev) => ({ ...prev, ...patch }));
    setError('');
  };
  const digits = (v: string) => v.replace(/[^0-9]/g, '').slice(0, 6);

  const addPreset = () => {
    const n = Number(presetText);
    if (n > 0 && !p.presets.includes(n)) set({ presets: [...p.presets, n].sort((a, b) => a - b) });
    setPresetText('');
  };

  const submit = () => {
    const name = p.name.trim();
    const category = (addingCategory ? newCategory : p.category).trim();
    const price = Number(priceText || 0);
    if (!name) return setError('品名を入れてください');
    if (!category) return setError('区分を選ぶか、新しい区分の名前を入れてください');
    if (!p.variable && price <= 0) return setError('価格を入れてください（毎回変わる商品は「時価」を選びます）');
    onSave({ ...p, name, category, price });
  };

  return (
    <div className="page">
      <div className="page-head">
        <button type="button" className="btn btn-sub" onClick={onCancel}>
          ← やめる
        </button>
        <h1>{isNew ? '商品を追加' : '商品を編集'}</h1>
        <span />
      </div>

      <div className="form">
        <label>
          <span className="label">品名（レジのボタンに出る名前）</span>
          <input value={p.name} onChange={(e) => set({ name: e.target.value })} placeholder="トマト" />
        </label>

        <div>
          <span className="label">区分</span>
          <div className="choice-row">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                className={`btn choice ${!addingCategory && p.category === c ? 'selected' : ''}`}
                onClick={() => {
                  setAddingCategory(false);
                  set({ category: c });
                }}
              >
                {c}
              </button>
            ))}
            <button
              type="button"
              className={`btn choice ${addingCategory ? 'selected' : ''}`}
              onClick={() => setAddingCategory(true)}
            >
              ＋ 新しい区分
            </button>
          </div>
          {addingCategory && (
            <input
              className="mt"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="きのこ"
            />
          )}
        </div>

        <div>
          <span className="label">価格の決め方</span>
          <div className="choice-row">
            <button
              type="button"
              className={`btn choice ${!p.variable ? 'selected' : ''}`}
              onClick={() => set({ variable: false })}
            >
              決まった価格
            </button>
            <button
              type="button"
              className={`btn choice ${p.variable ? 'selected' : ''}`}
              onClick={() => set({ variable: true })}
            >
              時価（毎回入力）
            </button>
          </div>
        </div>

        <label>
          <span className="label">{p.variable ? '最初に表示する価格（空欄でもOK）' : '価格（税込）'}</span>
          <span className="yen-input">
            <input
              value={priceText}
              onChange={(e) => {
                setPriceText(digits(e.target.value));
                setError('');
              }}
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="200"
            />
            円
          </span>
        </label>

        {p.variable && (
          <div>
            <span className="label">よく使う価格（時価の入力画面にワンタッチで出ます）</span>
            <div className="choice-row">
              {p.presets.map((n) => (
                <span key={n} className="chip">
                  {yen(n)}
                  <button
                    type="button"
                    className="chip-x"
                    onClick={() => set({ presets: p.presets.filter((x) => x !== n) })}
                    aria-label={`${n}円を外す`}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
            <span className="yen-input mt">
              <input
                value={presetText}
                onChange={(e) => setPresetText(digits(e.target.value))}
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="300"
                onKeyDown={(e) => e.key === 'Enter' && addPreset()}
              />
              円
              <button type="button" className="btn btn-small" onClick={addPreset}>
                ＋ 追加
              </button>
            </span>
          </div>
        )}

        <div>
          <span className="label">「よく売れる」タブに出す</span>
          <div className="choice-row">
            <button type="button" className={`btn choice ${p.popular ? 'selected' : ''}`} onClick={() => set({ popular: true })}>
              出す
            </button>
            <button type="button" className={`btn choice ${!p.popular ? 'selected' : ''}`} onClick={() => set({ popular: false })}>
              出さない
            </button>
          </div>
        </div>

        <div>
          <span className="label">レジに表示（季節外の商品は「隠す」にします）</span>
          <div className="choice-row">
            <button type="button" className={`btn choice ${p.visible ? 'selected' : ''}`} onClick={() => set({ visible: true })}>
              表示する
            </button>
            <button type="button" className={`btn choice ${!p.visible ? 'selected' : ''}`} onClick={() => set({ visible: false })}>
              隠す
            </button>
          </div>
        </div>

        {error && <p className="error">{error}</p>}
        {!online && <p className="notice-warn">オフラインのため保存できません。インターネットにつながる場所で保存してください。</p>}

        <div className="form-actions">
          <button type="button" className="btn btn-sub" onClick={onCancel}>
            やめる
          </button>
          <button type="button" className="btn btn-go" onClick={submit} disabled={saving}>
            {saving ? '保存中…' : '保存する'}
          </button>
        </div>
      </div>

      {!isNew && (
        <div className="danger-zone">
          {confirmDelete ? (
            <>
              <p>「{initial.name}」を商品マスタから削除します。過去の売上の記録は残ります。</p>
              <div className="form-actions">
                <button type="button" className="btn btn-sub" onClick={() => setConfirmDelete(false)}>
                  やめる
                </button>
                <button type="button" className="btn btn-del btn-del-big" onClick={onDelete} disabled={saving}>
                  削除する
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="muted small">しばらく売らないだけなら、削除せずに「隠す」にするのがおすすめです。</p>
              <button type="button" className="btn btn-del" onClick={() => setConfirmDelete(true)}>
                この商品を削除
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
