export type Product = {
  id: string;
  name: string;
  category: string;
  /** 固定価格。時価の商品では入力欄の初期値として使う（0 なら空欄） */
  price: number;
  /** 時価（毎回価格を入力する）商品か */
  variable: boolean;
  /** 時価入力のときに出す「よく使う価格」ボタン */
  presets: number[];
  order: number;
  visible: boolean;
  popular: boolean;
};

export type CartLine = {
  key: string;
  productId: string | null;
  name: string;
  category: string;
  unitPrice: number;
  qty: number;
  variable: boolean;
};

export type PayMethod = 'cash' | 'paypay';

export type SaleItem = {
  productId: string | null;
  name: string;
  unitPrice: number;
  qty: number;
  subtotal: number;
};

export type Sale = {
  id: string;
  createdAt: string; // ISO 文字列
  device: string;
  method: PayMethod;
  total: number;
  received: number;
  change: number;
  voided: boolean;
  items: SaleItem[];
  /** 修正した日時（修正していなければなし） */
  editedAt?: string;
  /** 修正・取消のたびに 1 増える。同期中に変わったかの判定用 */
  rev?: number;
  /** 0 = 未送信, 1 = 送信済み（Dexie のインデックス用に数値） */
  synced: 0 | 1;
};

export type Settings = {
  gasUrl: string;
  token: string;
  deviceName: string;
};
