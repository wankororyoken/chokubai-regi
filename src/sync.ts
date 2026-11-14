import { db, getMeta, setMeta } from './db';
import type { Product, Sale, Settings } from './types';

export const defaultSettings: Settings = { gasUrl: '', token: '', deviceName: 'レジ1' };

export async function loadSettings(): Promise<Settings> {
  return { ...defaultSettings, ...(await getMeta<Partial<Settings>>('settings', {})) };
}

export async function saveSettings(s: Settings) {
  await setMeta('settings', s);
}

export type SyncResult = { ok: boolean; message: string };

let running = false;

/** GAS の Web アプリと同期する。未送信の売上を送り、商品マスタを全件受け取る */
export async function syncNow(): Promise<SyncResult> {
  if (running) return { ok: false, message: '同期中です' };
  const settings = await loadSettings();
  if (!settings.gasUrl) return { ok: false, message: '設定画面で同期先URLを登録してください' };
  if (!navigator.onLine) return { ok: false, message: 'インターネットにつながっていません' };

  running = true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const unsent: Sale[] = await db.sales.where('synced').equals(0).toArray();
    // Content-Type を指定しない（text/plain になる）ことで、GAS が苦手な事前確認(CORS preflight)を避ける
    const res = await fetch(settings.gasUrl, {
      method: 'POST',
      body: JSON.stringify({
        token: settings.token,
        device: settings.deviceName,
        sales: unsent.map(({ synced: _s, ...rest }) => rest),
      }),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, message: `通信エラー (${res.status})` };
    const data = await res.json();
    if (!data.ok) return { ok: false, message: data.error ?? '同期に失敗しました' };

    const savedIds: string[] = Array.isArray(data.savedIds) ? data.savedIds : [];
    const products = sanitizeProducts(data.products);

    await db.transaction('rw', db.sales, db.products, db.meta, async () => {
      // 送信中に修正・取消された売上は、送った時点の内容と変わっているので未送信のまま残す
      for (const s of unsent) {
        if (!savedIds.includes(s.id)) continue;
        const now = await db.sales.get(s.id);
        if (now && (now.rev ?? 0) === (s.rev ?? 0)) await db.sales.update(s.id, { synced: 1 });
      }
      if (products.length > 0) {
        await db.products.clear();
        await db.products.bulkPut(products);
        await setMeta('lastMasterAt', new Date().toISOString());
      }
      await setMeta('lastSyncAt', new Date().toISOString());
    });

    const sent = savedIds.length;
    return {
      ok: true,
      message: `同期しました（売上 ${sent}件送信・商品 ${products.length}件）`,
    };
  } catch (e) {
    if ((e as Error).name === 'AbortError') return { ok: false, message: '時間切れになりました。電波の良い場所でもう一度お試しください' };
    return { ok: false, message: '同期できませんでした。URLと電波を確認してください' };
  } finally {
    clearTimeout(timer);
    running = false;
  }
}

/** スプレッドシートから来たデータのうち、明らかにおかしい行は読み飛ばす */
function sanitizeProducts(raw: unknown): Product[] {
  if (!Array.isArray(raw)) return [];
  const out: Product[] = [];
  raw.forEach((r, i) => {
    if (!r || typeof r !== 'object') return;
    const p = r as Record<string, unknown>;
    const name = String(p.name ?? '').trim();
    const id = String(p.id ?? '').trim();
    const price = Number(p.price ?? 0);
    if (!name || !id || !Number.isFinite(price) || price < 0) return;
    const presets = Array.isArray(p.presets)
      ? p.presets.map(Number).filter((n) => Number.isFinite(n) && n > 0)
      : [];
    out.push({
      id,
      name,
      category: String(p.category ?? '').trim() || 'その他',
      price: Math.round(price),
      variable: Boolean(p.variable),
      presets,
      order: Number.isFinite(Number(p.order)) ? Number(p.order) : i + 1,
      visible: p.visible !== false,
      popular: Boolean(p.popular),
    });
  });
  return out;
}
