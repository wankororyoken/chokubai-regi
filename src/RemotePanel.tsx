import { useEffect, useState } from 'react';
import { getMeta } from './db';
import { fetchRemoteSales, PULL_DAYS } from './sync';
import { formatDateTime } from './util';

export type Scope = 'local' | 'all';

type Props = {
  scope: Scope;
  onScope: (s: Scope) => void;
  /** 表示中の期間（「取得」ボタンはこの期間の全端末の取引を受け取る） */
  start: Date;
  end: Date;
  /** 取得が終わったら、画面の表示を読み直す */
  onFetched: () => void;
};

/** 履歴・集計で共通の「この端末／全端末」切り替えと、全端末の売上の取得欄 */
export function RemotePanel({ scope, onScope, start, end, onFetched }: Props) {
  const [pulledAt, setPulledAt] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    getMeta<string | null>('remotePulledAt', null).then(setPulledAt);
  }, []);

  const fetchAll = async () => {
    setFetching(true);
    setMessage(null);
    const r = await fetchRemoteSales(start, end);
    setFetching(false);
    setMessage({ text: r.message, error: !r.ok });
    setPulledAt(await getMeta<string | null>('remotePulledAt', null));
    if (r.ok) onFetched();
  };

  return (
    <>
      <div className="scope-switch" role="tablist" aria-label="表示する端末">
        <button
          type="button"
          role="tab"
          aria-selected={scope === 'all'}
          className={`btn choice ${scope === 'all' ? 'selected' : ''}`}
          onClick={() => onScope('all')}
        >
          全端末
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={scope === 'local'}
          className={`btn choice ${scope === 'local' ? 'selected' : ''}`}
          onClick={() => onScope('local')}
        >
          この端末だけ
        </button>
      </div>

      {scope === 'all' && (
        <div className="fetch-panel">
          <div className="fetch-info">
            <span className="label">他の端末の売上　最終取得</span>
            <strong className="fetch-time">{pulledAt ? formatDateTime(pulledAt) : 'まだ取得していません'}</strong>
          </div>
          <button type="button" className="btn btn-go" onClick={fetchAll} disabled={fetching}>
            {fetching ? '取得中…' : '⟳ 全端末の売上を取得'}
          </button>
          {message && <p className={`${message.error ? 'error' : 'ok-text'} fetch-error`}>{message.text}</p>}
          <p className="muted small fetch-note">
            他の端末の売上は、取得したときの内容です（「⟳ 同期」でも直近{PULL_DAYS}日分を受け取ります）。まだ同期していない端末の売上は含まれません。
          </p>
        </div>
      )}
    </>
  );
}
