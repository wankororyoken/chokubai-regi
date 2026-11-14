import type { Product } from './types';

// 初回起動時（まだ一度も同期していないとき）だけ使うお試し用の商品
const rows: [string, string, number, boolean, boolean, number[]?][] = [
  ['卵 10個', '卵', 400, false, true],
  ['卵 6個', '卵', 250, false, true],
  ['卵 30個', '卵', 1100, false, false],
  ['トマト', '野菜', 200, false, true],
  ['ミニトマト', '野菜', 250, false, false],
  ['きゅうり', '野菜', 150, false, true],
  ['なす', '野菜', 150, false, false],
  ['ピーマン', '野菜', 120, false, false],
  ['大根', '野菜', 0, true, true, [150, 200, 250, 300]],
  ['白菜', '野菜', 0, true, true, [200, 300, 400]],
  ['キャベツ', '野菜', 0, true, false, [150, 200, 250]],
  ['ネギ', '野菜', 180, false, true],
  ['ほうれん草', '野菜', 150, false, false],
  ['じゃがいも', '野菜', 200, false, false],
  ['玉ねぎ', '野菜', 200, false, false],
  ['りんご', '果物', 0, true, false, [100, 150, 200]],
  ['みかん', '果物', 300, false, false],
  ['いちごジャム', '加工品', 600, false, true],
  ['漬物', '加工品', 300, false, false],
  ['切り干し大根', '加工品', 250, false, false],
];

export const sampleProducts: Product[] = rows.map(([name, category, price, variable, popular, presets], i) => ({
  id: `sample-${i + 1}`,
  name,
  category,
  price,
  variable,
  presets: presets ?? [],
  order: i + 1,
  visible: true,
  popular,
}));
