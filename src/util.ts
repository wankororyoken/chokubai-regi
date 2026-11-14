export const yen = (n: number) => `${Math.round(n).toLocaleString('ja-JP')}円`;

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function formatDateTime(iso: string | null) {
  if (!iso) return 'まだありません';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function formatTime(iso: string) {
  const d = new Date(iso);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 区分名ごとのタイルの色 */
const fixedColors: Record<string, string> = { 野菜: 'green', 卵: 'amber', 果物: 'coral', 加工品: 'purple', その他: 'gray' };
const cycle = ['teal', 'blue', 'pink', 'gray'];
export function categoryColor(category: string, allCategories: string[]) {
  if (fixedColors[category]) return fixedColors[category];
  const others = allCategories.filter((c) => !fixedColors[c]);
  return cycle[Math.max(0, others.indexOf(category)) % cycle.length];
}
