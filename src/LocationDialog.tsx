import { useEffect, useState } from 'react';
import { loadLocationChoices } from './salesData';

type Props = {
  current: string;
  /** 取引の修正中なら、その取引の説明（例「11:30の取引」） */
  editingLabel: string | null;
  onSelect: (name: string) => void;
  onCancel: () => void;
};

/** 販売場所を選ぶ画面。一覧から選ぶか、新しい場所を入力する */
export function LocationDialog({ current, editingLabel, onSelect, onCancel }: Props) {
  const [choices, setChoices] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadLocationChoices().then((list) => {
      setChoices(list);
      if (list.length === 0) setAdding(true);
    });
  }, []);

  const addNew = () => {
    const name = newName.trim();
    if (!name) return setError('場所の名前を入れてください');
    onSelect(name);
  };

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="販売場所を選ぶ">
        <h2 className="dialog-title">{editingLabel ? `${editingLabel}の販売場所` : '販売場所を選ぶ'}</h2>
        <p className="muted small">
          {editingLabel
            ? 'この取引の場所だけを変更します。'
            : '選んだ場所は、変更するまで次の会計にも使われます。'}
        </p>

        <div className="location-list">
          {choices.map((c) => (
            <button
              key={c}
              type="button"
              className={`btn location-choice ${c === current ? 'selected' : ''}`}
              onClick={() => onSelect(c)}
            >
              {c === current ? '✔ ' : ''}
              {c}
            </button>
          ))}
        </div>

        {adding ? (
          <div className="location-new">
            <p className="label">新しい場所の名前</p>
            <input
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && addNew()}
              placeholder="〇〇スーパー 駅前店"
              autoFocus
            />
            {error && <p className="error">{error}</p>}
            <button type="button" className="btn btn-go" onClick={addNew}>
              この場所にする
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-sub location-add" onClick={() => setAdding(true)}>
            ＋ 新しい場所を追加
          </button>
        )}

        <div className="dialog-actions">
          <button type="button" className="btn btn-sub" onClick={onCancel}>
            やめる
          </button>
          {current && (
            <button type="button" className="btn btn-sub" onClick={() => onSelect('')}>
              場所を未設定にする
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
