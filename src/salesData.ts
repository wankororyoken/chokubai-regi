import { db, getMeta, setMeta } from './db';
import type { CurrentLocation, RemoteSale, Sale } from './types';

/** 履歴・集計で使う取引。remote が true のものは他の端末の取引 */
export type ListedSale = (Sale | RemoteSale) & { remote: boolean };

/**
 * 期間内の取引を「この端末」と「他の端末」をまとめて返す。
 * スプレッドシートから受け取った中にこの端末の取引も含まれるが、この端末の記録（未送信の修正も含む）を優先する。
 */
export async function loadSales(start: Date, end: Date, includeRemote: boolean): Promise<ListedSale[]> {
  const s = start.toISOString();
  const e = end.toISOString();
  const local = await db.sales.where('createdAt').between(s, e, true, false).toArray();
  const out: ListedSale[] = local.map((x) => ({ ...x, remote: false }));
  if (includeRemote) {
    const ids = new Set(local.map((x) => x.id));
    const remote = await db.remoteSales.where('createdAt').between(s, e, true, false).toArray();
    // この端末で以前に会計した取引（端末のデータを消した場合など）も、スプレッドシートからの分として出る
    for (const r of remote) if (!ids.has(r.id)) out.push({ ...r, remote: true });
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export const getCurrentLocation = () => getMeta<CurrentLocation | null>('currentLocation', null);
export const setCurrentLocation = (loc: CurrentLocation | null) => setMeta('currentLocation', loc);

/** この端末で入力・選択したことのある場所（新しい順）。会計に使う前でも選択肢から消えないように覚えておく */
export const getMyLocations = () => getMeta<string[]>('myLocations', []);

export async function rememberLocation(name: string) {
  const list = await getMyLocations();
  await setMeta('myLocations', [name, ...list.filter((x) => x !== name)].slice(0, 100));
}

/** 場所の選択肢：スプレッドシートの「販売場所」の順に、この端末や他の端末で使ったことのある場所を加える */
export async function loadLocationChoices(): Promise<string[]> {
  const fromSheet = await getMeta<string[]>('locations', []);
  // この端末で入力・選択した場所（まだ会計に使っていない場所も含む）
  const used = new Set<string>(await getMyLocations());
  await db.sales.orderBy('createdAt').reverse().limit(500).each((s) => {
    if (s.location) used.add(s.location);
  });
  // 他の端末で使われた場所も選べるように
  await db.remoteSales.orderBy('createdAt').reverse().limit(500).each((s) => {
    if (s.location) used.add(s.location);
  });
  // スプレッドシートで「非表示」にした場所は、この端末で入力したものでも出さない（今選んでいる場所は除く）
  const hidden = new Set(await getMeta<string[]>('hiddenLocations', []));
  for (const h of hidden) used.delete(h);
  const current = await getCurrentLocation();
  if (current?.name) used.add(current.name);
  return [...fromSheet, ...[...used].filter((x) => !fromSheet.includes(x))];
}
