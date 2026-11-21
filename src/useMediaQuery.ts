import { useEffect, useState } from 'react';

/** CSS のメディアクエリに一致するかを返す（画面の向きや大きさが変わると更新される） */
export function useMediaQuery(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatch(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    // 端末によっては回転時に change が届かないことがあるので、画面サイズの変化でも確認する
    window.addEventListener('resize', onChange);
    return () => {
      mql.removeEventListener('change', onChange);
      window.removeEventListener('resize', onChange);
    };
  }, [query]);
  return match;
}

/** スマホ（縦・横）向けの詰めたレイアウトにする条件。styles.css の同じ条件と合わせること */
export const COMPACT_QUERY = '(max-width: 600px), (max-height: 500px)';
