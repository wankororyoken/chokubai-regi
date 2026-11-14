import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles.css';

// オフラインで起動できるよう Service Worker を登録（新しい版があれば自動更新）
registerSW({ immediate: true });

// iPhone / iPad では画面上端がぼかされるので、目印のクラスを付けて CSS で余白を取る
// （iPad は Mac と同じ表記になるため、タッチ対応かどうかで見分ける）
const isIOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (isIOS) document.documentElement.classList.add('ios');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
