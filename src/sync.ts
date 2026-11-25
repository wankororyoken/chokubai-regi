import { db, getMeta, setMeta } from './db';
import { getMyLocations } from './salesData';
import type { Product, RemoteSale, Sale, Settings } from './types';

export const defaultSettings: Settings = { gasUrl: '', token: '', deviceName: 'レジ1' };

export async function loadSettings(): Promise<Settings> {
  return { ...defaultSettings, ...(await getMeta<Partial<Settings>>('settings', {})) };
}

export async function saveSettings(s: Settings) {
  await setMeta('settings', s);
}

export type SyncResult = { ok: boolean; message: string };

let running = false;

/** 同期のついでに受け取る、他の端末の取引の期間（今日を含む過去何日分か） */
export const PULL_DAYS = 31;

function pullRange() {
  const t = new Date();
  return {
    start: new Date(t.getFullYear(), t.getMonth(), t.getDate() - (PULL_DAYS - 1)),
    end: new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1),
  };
}

/**
 * GAS の Web アプリと同期する。未送信の売上を送り、商品マスタと販売場所を受け取る。
 * pull が true なら、直近の全端末の取引も受け取る（会計直後の自動同期では通信を軽くするため受け取らない）。
 */
export async function syncNow(opts: { pull?: boolean } = {}): Promise<SyncResult> {
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
        // 入力した場所を送り、スプレッドシートの「販売場所」に載せて他の端末でも選べるようにする
        locations: await getMyLocations(),
        pull: opts.pull ? { start: pullRange().start.toISOString(), end: pullRange().end.toISOString() } : undefined,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, message: `通信エラー (${res.status})` };
    const data = await res.json();
    if (!data.ok) return { ok: false, message: data.error ?? '同期に失敗しました' };

    const savedIds: string[] = Array.isArray(data.savedIds) ? data.savedIds : [];
    const products = sanitizeProducts(data.products);

    await db.transaction('rw', db.sales, db.products, db.meta, db.remoteSales, async () => {
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
      if (Array.isArray(data.locations)) {
        await setMeta('locations', data.locations.map(String).filter((x: string) => x.trim()));
      }
      if (Array.isArray(data.hiddenLocations)) {
        await setMeta('hiddenLocations', data.hiddenLocations.map(String));
      }
      if (data.pulled && Array.isArray(data.pulled.sales)) {
        await storeRemoteSales(new Date(data.pulled.start), new Date(data.pulled.end), data.pulled.sales);
      }
      await setMeta('lastSyncAt', new Date().toISOString());
    });

    const sent = savedIds.length;
    const old = opts.pull && !data.pulled ? '。GASのスクリプトが古いため、他の端末の売上は受け取れませんでした' : '';
    return {
      ok: true,
      message: `同期しました（売上 ${sent}件送信・商品 ${products.length}件）${old}`,
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

/**
 * 「商品の管理」画面から商品を保存・削除する。
 * スプレッドシートに書き込んだあと、最新の商品マスタを受け取ってこの端末にも反映する。
 * 他の端末には、それぞれが次に同期したときに反映される。
 */
export async function saveProductsRemote(upserts: Product[], deletes: string[] = []): Promise<SyncResult> {
  const settings = await loadSettings();
  if (!settings.gasUrl) return { ok: false, message: '設定画面で同期先URLを登録してください' };
  if (!navigator.onLine) return { ok: false, message: 'インターネットにつながっているときに保存できます' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch(settings.gasUrl, {
      method: 'POST',
      body: JSON.stringify({ token: settings.token, action: 'saveProducts', upserts, deletes }),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, message: `通信エラー (${res.status})` };
    const data = await res.json();
    if (!data.ok) return { ok: false, message: data.error ?? '保存できませんでした' };
    // 古い GAS は商品の保存を知らずに普通の同期として返事をするので、ここで見分ける
    if (!data.applied) {
      return { ok: false, message: 'GASのスクリプトが古いため保存できません。最新のスクリプトに更新してください' };
    }
    const products = sanitizeProducts(data.products);
    await db.transaction('rw', db.products, db.meta, async () => {
      await db.products.clear();
      await db.products.bulkPut(products);
      await setMeta('lastMasterAt', new Date().toISOString());
    });
    return { ok: true, message: '保存しました（他の端末には次の同期で反映されます）' };
  } catch (e) {
    if ((e as Error).name === 'AbortError') return { ok: false, message: '時間切れになりました。電波の良い場所でもう一度お試しください' };
    return { ok: false, message: '保存できませんでした。電波と設定を確認してください' };
  } finally {
    clearTimeout(timer);
  }
}

/** 受け取った他の端末の取引を、その期間の分だけ入れ替えて保存する */
async function storeRemoteSales(start: Date, end: Date, raw: unknown[]) {
  const rows: RemoteSale[] = raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && typeof (r as { id?: unknown }).id === 'string')
    .map((r) => ({
      id: String(r.id),
      createdAt: String(r.createdAt),
      device: String(r.device ?? ''),
      method: r.method === 'paypay' ? 'paypay' : 'cash',
      total: Number(r.total) || 0,
      received: Number(r.received) || 0,
      change: Number(r.change) || 0,
      voided: r.voided === true,
      editedAt: typeof r.editedAt === 'string' ? r.editedAt : undefined,
      location: String(r.location ?? ''),
      items: Array.isArray(r.items) ? (r.items as RemoteSale['items']) : [],
    }));
  await db.remoteSales.where('createdAt').between(start.toISOString(), end.toISOString(), true, false).delete();
  await db.remoteSales.bulkPut(rows);
  await setMeta('remotePulledAt', new Date().toISOString());
}

/** 履歴・集計の「全端末の売上を取得」ボタン：表示中の期間の全端末の取引を受け取る */
export async function fetchRemoteSales(start: Date, end: Date): Promise<SyncResult> {
  const settings = await loadSettings();
  if (!settings.gasUrl) return { ok: false, message: '設定画面で同期先URLを登録してください' };
  if (!navigator.onLine) return { ok: false, message: 'インターネットにつながっているときに取得できます' };
  // 先にこの端末の未送信分を送っておくと、取得結果とこの端末の内容が揃う
  await syncNow();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch(settings.gasUrl, {
      method: 'POST',
      body: JSON.stringify({ token: settings.token, action: 'listSales', start: start.toISOString(), end: end.toISOString() }),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, message: `通信エラー (${res.status})` };
    const data = await res.json();
    if (!data.ok) return { ok: false, message: data.error ?? '取得できませんでした' };
    if (!data.applied || !Array.isArray(data.sales)) {
      return { ok: false, message: 'GASのスクリプトが古いため取得できません。最新のスクリプトに更新してください' };
    }
    await db.transaction('rw', db.remoteSales, db.meta, () => storeRemoteSales(start, end, data.sales));
    return { ok: true, message: `全端末の売上を取得しました（${data.sales.length}件）` };
  } catch (e) {
    if ((e as Error).name === 'AbortError') return { ok: false, message: '時間切れになりました。電波の良い場所でもう一度お試しください' };
    return { ok: false, message: '取得できませんでした。電波と設定を確認してください' };
  } finally {
    clearTimeout(timer);
  }
}
