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
  /** 売った場所（スーパー名など）。未設定なら空 */
  location?: string;
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

/** 集計画面に出す内容（この端末の売上から計算したものと、GASから受け取った全端末分の両方で使う） */
export type SummaryData = {
  count: number;
  cash: number;
  paypay: number;
  paypayCount: number;
  items: { name: string; qty: number; amount: number; cashAmount: number; paypayAmount: number; paypayQty: number }[];
  paypaySales: { id: string; createdAt: string; total: number; items: string; device?: string; location?: string }[];
  /** 全端末の集計のときだけ：端末ごとの件数と合計 */
  devices?: { device: string; count: number; total: number }[];
  /** 販売場所ごとの件数と合計（'' は場所なし） */
  locations?: { location: string; count: number; total: number }[];
};

/** 他の端末の取引（同期・取得でスプレッドシートから受け取ったもの。この端末では修正できない） */
export type RemoteSale = Omit<Sale, 'synced' | 'rev'>;

/** レジで今選んでいる販売場所と、選んだ日時 */
export type CurrentLocation = { name: string; setAt: string };
