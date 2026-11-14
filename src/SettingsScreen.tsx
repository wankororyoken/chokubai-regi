import { useEffect, useState } from 'react';
import { loadSettings, saveSettings } from './sync';
import type { Settings } from './types';

type Props = {
  onBack: () => void;
  onSync: () => void;
  syncing: boolean;
  onOpenProducts: () => void;
};

export function SettingsScreen({ onBack, onSync, syncing, onOpenProducts }: Props) {
  const [s, setS] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings().then(setS);
  }, []);

  if (!s) return null;
  const set = (k: keyof Settings, v: string) => {
    setS({ ...s, [k]: v });
    setSaved(false);
  };

  return (
    <div className="page">
      <div className="page-head">
        <button type="button" className="btn btn-sub" onClick={onBack}>
          ← レジに戻る
        </button>
        <h1>設定</h1>
        <span />
      </div>

      <div className="form">
        <div>
          <span className="label">商品の追加・価格の変更・並び替え</span>
          <button type="button" className="btn btn-sub btn-wide" onClick={onOpenProducts}>
            商品の管理 →
          </button>
        </div>
      </div>

      <h2 className="section-title">同期の設定</h2>
      <div className="form">
        <label>
          <span className="label">同期先URL（GASのWebアプリのURL）</span>
          <input
            value={s.gasUrl}
            onChange={(e) => set('gasUrl', e.target.value.trim())}
            placeholder="https://script.google.com/macros/s/xxxx/exec"
            inputMode="url"
          />
        </label>
        <label>
          <span className="label">合言葉（GASの TOKEN と同じもの）</span>
          <input value={s.token} onChange={(e) => set('token', e.target.value.trim())} />
        </label>
        <label>
          <span className="label">この端末の名前（売上の記録に残ります）</span>
          <input value={s.deviceName} onChange={(e) => set('deviceName', e.target.value)} placeholder="レジ1" />
        </label>
        <div className="form-actions">
          <button
            type="button"
            className="btn btn-go"
            onClick={async () => {
              await saveSettings(s);
              setSaved(true);
            }}
          >
            保存する
          </button>
          <button
            type="button"
            className="btn btn-sub"
            disabled={syncing}
            onClick={async () => {
              await saveSettings(s);
              setSaved(true);
              onSync();
            }}
          >
            {syncing ? '同期中…' : '保存して今すぐ同期'}
          </button>
          {saved && <span className="ok-text">保存しました</span>}
        </div>
      </div>

      <div className="notes">
        <h2>使い方のメモ</h2>
        <ul>
          <li>商品の追加・価格の変更は「商品の管理」かスプレッドシートの「商品マスタ」で行います。他の端末には「同期」を押すと反映されます。</li>
          <li>会計中に価格を変えたいときは、明細の「@価格 ✎」を押します（その会計だけの変更です）。</li>
          <li>電波がなくても会計できます。売上はタブレットに保存され、次に同期したときに送られます。</li>
          <li>「未送信」が残っている間は、ブラウザのデータ削除やアプリの削除をしないでください。</li>
        </ul>
      </div>
    </div>
  );
}
