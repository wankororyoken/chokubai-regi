import Dexie, { type Table } from 'dexie';
import type { Product, RemoteSale, Sale } from './types';

type Meta = { key: string; value: unknown };

class RegiDB extends Dexie {
  products!: Table<Product, string>;
  sales!: Table<Sale, string>;
  remoteSales!: Table<RemoteSale, string>;
  meta!: Table<Meta, string>;
  constructor() {
    super('chokubai-regi');
    this.version(1).stores({
      products: 'id, order',
      sales: 'id, createdAt, synced',
      meta: 'key',
    });
    // v2：他の端末の取引を置いておく表を追加
    this.version(2).stores({
      remoteSales: 'id, createdAt',
    });
  }
}

export const db = new RegiDB();

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key);
  return row ? (row.value as T) : fallback;
}

export async function setMeta(key: string, value: unknown) {
  await db.meta.put({ key, value });
}
