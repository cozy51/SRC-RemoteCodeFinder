import { useEffect, useMemo, useRef, useState } from 'react';
import { ImageModal } from './components/ImageModal';
import { modes, remoteCodes, type RemoteCode, type RemoteMode } from './data/remoteCodes';
import { isCloudConfigured } from './services/auth';
import { loadFavorites, saveFavoriteChange, type Favorite } from './services/favoritesStorage';
import './styles.css';

const isMode = (value: string | null): value is RemoteMode => modes.some((mode) => mode.id === value);
const favoriteKey = ({ mode, code }: Favorite) => `${mode}:${code}`;

function App() {
  const params = new URLSearchParams(location.search);
  const initialMode = isMode(params.get('mode')) ? params.get('mode') as RemoteMode : modes[0].id;
  const directCode = params.get('code');
  const [mode, setMode] = useState<RemoteMode>(initialMode);
  const [query, setQuery] = useState(directCode ?? '');
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [cloudMessage, setCloudMessage] = useState(isCloudConfigured ? 'OneDriveに接続してお気に入りを同期できます' : 'OneDrive連携は未設定です');
  const [toast, setToast] = useState('');
  const [imageItem, setImageItem] = useState<RemoteCode>();
  const highlightedRef = useRef<HTMLElement>(null);

  useEffect(() => { if (directCode) highlightedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [directCode]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 2200); return () => clearTimeout(timer); }, [toast]);

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return remoteCodes.filter((item) => item.mode === mode && (!normalized || `${item.code}\n${item.command}\n${item.note ?? ''}`.toLocaleLowerCase().includes(normalized)));
  }, [mode, query]);
  const favoriteSet = useMemo(() => new Set(favorites.map(favoriteKey)), [favorites]);
  const favoriteItems = favorites.flatMap((favorite) => remoteCodes.filter((item) => item.mode === favorite.mode && item.code === favorite.code));

  async function connect() {
    try { setFavorites(await loadFavorites(true)); setCloudMessage('OneDriveと同期済み'); }
    catch (error) { setCloudMessage(error instanceof Error ? error.message : 'お気に入りを取得できませんでした'); }
  }
  async function toggleFavorite(item: RemoteCode) {
    const favorite = { mode: item.mode, code: item.code };
    const action = favoriteSet.has(favoriteKey(favorite)) ? 'remove' : 'add';
    try { setCloudMessage('OneDriveへ保存中…'); setFavorites(await saveFavoriteChange({ favorite, action })); setCloudMessage('OneDriveと同期済み'); }
    catch (error) { setCloudMessage(error instanceof Error ? error.message : 'お気に入りの保存に失敗しました'); }
  }
  function openFavorite(item: RemoteCode) { setMode(item.mode); setQuery(item.code); history.replaceState(null, '', `/?mode=${encodeURIComponent(item.mode)}&code=${encodeURIComponent(item.code)}`); window.scrollTo({ top: document.querySelector('.search-panel')?.getBoundingClientRect().top ?? 0, behavior: 'smooth' }); }
  async function copyCode(code: string) { try { await navigator.clipboard.writeText(code); setToast(`${code} をコピーしました`); } catch { setToast('コピーできませんでした'); } }

  return <>
    <header><div className="header-inner"><div className="brand"><img src="/app-icon.svg" alt="" width="76" height="76" /><div><p className="eyebrow">FIELD TOOL</p><h1>SRC Remote Code Finder</h1><p className="subtitle">SRCリモコン コード検索</p></div></div><button className="cloud-button" onClick={connect}>☁ OneDrive接続</button></div></header>
    <main>
      <section aria-labelledby="mode-heading"><div className="section-heading"><div><p className="step">01</p><h2 id="mode-heading">モード選択</h2></div><p>使用するモードを選んでください</p></div>
        <div className="mode-grid">{modes.map((item) => <button key={item.id} className={mode === item.id ? 'mode active' : 'mode'} onClick={() => { setMode(item.id); setQuery(''); history.replaceState(null, '', `/?mode=${encodeURIComponent(item.id)}`); }}><strong>{item.id}</strong><span>{item.label}</span></button>)}</div>
      </section>
      <section className="favorites" aria-labelledby="favorites-heading"><div className="favorites-title"><div><p className="step">★</p><h2 id="favorites-heading">よく使うコード</h2></div><span className="cloud-status">{cloudMessage}</span></div>
        {favoriteItems.length ? <div className="favorite-list">{favoriteItems.map((item, index) => <button key={`${item.mode}-${item.code}-${index}`} onClick={() => openFavorite(item)}><span>{item.code}</span><small>{item.mode} · {item.command || '（コマンド空欄）'}</small></button>)}</div> : <p className="empty-favorites">OneDriveに接続し、コードの ☆ から登録できます。</p>}
      </section>
      <section className="search-panel" aria-labelledby="list-heading"><div className="section-heading"><div><p className="step">02</p><h2 id="list-heading">{mode} のコード</h2></div><strong className="count">{results.length}件</strong></div>
        <div className="search-wrap"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="コード・コマンド・備考を検索" aria-label="コード検索" autoComplete="off" />{query && <button onClick={() => setQuery('')} aria-label="検索をクリア">× クリア</button>}</div>
      </section>
      <div className="code-grid">{results.map((item, index) => {
        const selected = directCode === item.code;
        return <article key={`${item.mode}-${item.code}-${index}`} ref={selected ? highlightedRef : undefined} className={`code-card ${item.warning ? 'warning' : ''} ${selected ? 'highlighted' : ''}`}>
          <div className="code-top"><button className="code-number" onClick={() => copyCode(item.code)} title="クリックしてコピー">{item.code}<small>タップしてコピー</small></button><button className={`star ${favoriteSet.has(favoriteKey(item)) ? 'selected' : ''}`} onClick={() => toggleFavorite(item)} aria-label={`${item.code}をお気に入り${favoriteSet.has(favoriteKey(item)) ? '解除' : '登録'}`}>{favoriteSet.has(favoriteKey(item)) ? '★' : '☆'}</button></div>
          {item.warning && <span className="warning-label">⚠ 注意が必要なコード</span>}<h3>{item.command || '（コマンド空欄）'}</h3>{item.note && <p className="note">{item.note}</p>}
          <div className="card-footer"><span>{item.mode}</span>{item.imageUrl ? <button onClick={() => setImageItem(item)}>解説画像を見る</button> : <span className="no-image">画像なし</span>}</div>
        </article>;
      })}</div>
      {!results.length && <div className="no-results"><strong>該当するコードがありません</strong><p>検索語を変えるか、検索をクリアしてください。</p></div>}
    </main>
    {toast && <div className="toast" role="status">✓ {toast}</div>}{imageItem && <ImageModal item={imageItem} onClose={() => setImageItem(undefined)} />}
  </>;
}
export default App;
