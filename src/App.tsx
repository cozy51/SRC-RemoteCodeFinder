import { useEffect, useMemo, useRef, useState } from 'react';
import { ImageModal } from './components/ImageModal';
import { modes, remoteCodes, type RemoteCode, type RemoteMode } from './data/remoteCodes';
import { isCloudConfigured } from './services/auth';
import { imageUrlKey, loadCloudSettings, saveFavoriteChange, saveImageUrl, saveNote, type Favorite, type ImageUrls, type NoteOverrides } from './services/favoritesStorage';
import { getGoogleDriveFileId } from './services/googleDriveUrl';
import './styles.css';

const isMode = (value: string | null): value is RemoteMode => modes.some((mode) => mode.id === value);
const favoriteKey = ({ mode, code }: Favorite) => `${mode}:${code}`;
const codeCollator = new Intl.Collator(undefined, { numeric: true });

function App() {
  const params = new URLSearchParams(location.search);
  const initialMode = isMode(params.get('mode')) ? params.get('mode') as RemoteMode : modes[0].id;
  const directCode = params.get('code');
  const [mode, setMode] = useState<RemoteMode>(initialMode);
  const [query, setQuery] = useState(directCode ?? '');
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [imageUrls, setImageUrls] = useState<ImageUrls>({});
  const [notes, setNotes] = useState<NoteOverrides>({});
  const [cloudMessage, setCloudMessage] = useState(isCloudConfigured ? 'Google Driveに接続してお気に入りを同期できます' : 'Google Drive連携は未設定です');
  const [cloudState, setCloudState] = useState<'unsynced' | 'syncing' | 'synced'>('unsynced');
  const [toast, setToast] = useState('');
  const [imageItem, setImageItem] = useState<RemoteCode>();
  const [pendingImage, setPendingImage] = useState<{ item: RemoteCode; url: string }>();
  const [noteEditor, setNoteEditor] = useState<{ item: RemoteCode; value: string }>();
  const highlightedRef = useRef<HTMLElement>(null);
  const favoriteRevision = useRef(0);
  const favoritesRef = useRef<Favorite[]>([]);

  useEffect(() => { if (directCode) highlightedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [directCode]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 2200); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    if (!isCloudConfigured) return;
    const revision = favoriteRevision.current;
    setCloudState('syncing');
    loadCloudSettings(false).then((settings) => { if (favoriteRevision.current === revision) { favoritesRef.current = settings.favorites; setFavorites(settings.favorites); } setImageUrls(settings.imageUrls); setNotes(settings.notes); setCloudMessage('Google Driveと同期済み'); setCloudState('synced'); }).catch(() => { setCloudMessage('Google Driveと同期できていません — 接続してください'); setCloudState('unsynced'); });
  }, []);

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return remoteCodes
      .filter((item) => item.mode === mode && (!normalized || `${item.code}\n${item.command}\n${item.note ?? ''}`.toLocaleLowerCase().includes(normalized)))
      .sort((a, b) => codeCollator.compare(a.code, b.code));
  }, [mode, query]);
  const favoriteSet = useMemo(() => new Set(favorites.map(favoriteKey)), [favorites]);
  const favoriteItems = favorites.flatMap((favorite) => remoteCodes.filter((item) => item.mode === mode && item.mode === favorite.mode && item.code === favorite.code));

  async function connect() {
    const revision = favoriteRevision.current;
    try { setCloudState('syncing'); setCloudMessage('Google Driveと同期中…'); const settings = await loadCloudSettings(true); if (favoriteRevision.current === revision) { favoritesRef.current = settings.favorites; setFavorites(settings.favorites); } setImageUrls(settings.imageUrls); setNotes(settings.notes); setCloudMessage('Google Driveと同期済み'); setCloudState('synced'); }
    catch (error) { setCloudMessage(error instanceof Error ? error.message : 'お気に入りを取得できませんでした'); setCloudState('unsynced'); }
  }
  async function toggleFavorite(item: RemoteCode) {
    const favorite = { mode: item.mode, code: item.code };
    const action = favoritesRef.current.some((entry) => favoriteKey(entry) === favoriteKey(favorite)) ? 'remove' : 'add';
    const targetIsFavorite = action === 'add';
    favoriteRevision.current += 1;
    const nextFavorites = action === 'add'
      ? [...favoritesRef.current.filter((entry) => favoriteKey(entry) !== favoriteKey(favorite)), favorite]
      : favoritesRef.current.filter((entry) => favoriteKey(entry) !== favoriteKey(favorite));
    favoritesRef.current = nextFavorites;
    setFavorites(nextFavorites);
    try { setCloudState('syncing'); setCloudMessage('Google Driveへ保存中…'); await saveFavoriteChange({ favorite, action }); setCloudMessage('Google Driveと同期済み'); setCloudState('synced'); }
    catch (error) {
      setFavorites((current) => {
        const isCurrentlyFavorite = current.some((entry) => favoriteKey(entry) === favoriteKey(favorite));
        if (isCurrentlyFavorite !== targetIsFavorite) return current;
        const restored = action === 'add'
          ? current.filter((entry) => favoriteKey(entry) !== favoriteKey(favorite))
          : [...current, favorite];
        favoritesRef.current = restored;
        return restored;
      });
      setCloudMessage(error instanceof Error ? error.message : 'お気に入りの保存に失敗しました');
      setCloudState('unsynced');
    }
  }
  function openFavorite(item: RemoteCode) { setMode(item.mode); setQuery(item.code); history.replaceState(null, '', `/?mode=${encodeURIComponent(item.mode)}&code=${encodeURIComponent(item.code)}`); window.scrollTo({ top: document.querySelector('.search-panel')?.getBoundingClientRect().top ?? 0, behavior: 'smooth' }); }
  async function copyCode(code: string) { try { await navigator.clipboard.writeText(code); setToast(`${code} をコピーしました`); } catch { setToast('コピーできませんでした'); } }
  async function prepareImageUrl(item: RemoteCode) {
    try {
      const url = (await navigator.clipboard.readText()).trim();
      if (!url) { setToast('クリップボードにURLがありません'); return; }
      if (!getGoogleDriveFileId(url)) { setToast('Google Driveの共有URLをコピーしてから、もう一度お試しください'); return; }
      setPendingImage({ item, url });
    } catch { setToast('クリップボードを読み取れませんでした'); }
  }
  async function registerImageUrl() {
    if (!pendingImage) return;
    try {
      setCloudState('syncing'); setCloudMessage('Google Driveへ保存中…');
      setImageUrls(await saveImageUrl(pendingImage.item.mode, pendingImage.item.code, pendingImage.url));
      setPendingImage(undefined); setCloudMessage('Google Driveと同期済み'); setCloudState('synced'); setToast('画像URLを登録しました');
    } catch (error) { setCloudMessage(error instanceof Error ? error.message : '画像URLを保存できませんでした'); setCloudState('unsynced'); }
  }
  async function removeImageUrl(item: RemoteCode) {
    if (!window.confirm(`${item.code} の画像URLを削除しますか？`)) return;
    try {
      setCloudState('syncing'); setCloudMessage('Google Driveへ保存中…');
      setImageUrls(await saveImageUrl(item.mode, item.code, null));
      setCloudMessage('Google Driveと同期済み'); setCloudState('synced'); setToast('画像URLを削除しました');
    } catch (error) { setCloudMessage(error instanceof Error ? error.message : '画像URLを削除できませんでした'); setCloudState('unsynced'); }
  }
  async function saveEditedNote() {
    if (!noteEditor) return;
    try {
      const note = noteEditor.value.trim() || null;
      setCloudState('syncing'); setCloudMessage('Google Driveへ保存中…');
      setNotes(await saveNote(noteEditor.item.mode, noteEditor.item.code, note));
      setNoteEditor(undefined); setCloudMessage('Google Driveと同期済み'); setCloudState('synced'); setToast(note ? '備考を保存しました' : '備考を削除しました');
    } catch (error) { setCloudMessage(error instanceof Error ? error.message : '備考を保存できませんでした'); setCloudState('unsynced'); }
  }

  return <>
    <header><div className="header-inner"><div className="brand"><img src="/app-icon.svg" alt="" width="76" height="76" /><div><p className="eyebrow">FIELD TOOL</p><h1>SRC Remote Code Finder</h1><p className="subtitle">SRCリモコン コード検索</p></div></div><button className="cloud-button" onClick={connect}>☁ Google Drive接続</button></div></header>
    <main>
      <section aria-labelledby="mode-heading"><div className="section-heading"><div><p className="step">01</p><h2 id="mode-heading">モード選択</h2></div><p>使用するモードを選んでください</p></div>
        <div className="mode-grid">{modes.map((item) => <button key={item.id} className={mode === item.id ? 'mode active' : 'mode'} onClick={() => { setMode(item.id); setQuery(''); history.replaceState(null, '', `/?mode=${encodeURIComponent(item.id)}`); }}><strong>{item.id}</strong><span>{item.label}</span></button>)}</div>
      </section>
      <section className="favorites" aria-labelledby="favorites-heading"><div className="favorites-title"><div><p className="step">★</p><h2 id="favorites-heading">よく使うコード</h2></div><button className={`cloud-status ${cloudState}`} onClick={connect}>{cloudMessage}</button></div>
        {favoriteItems.length ? <div className="favorite-list">{favoriteItems.map((item, index) => <button key={`${item.mode}-${item.code}-${index}`} onClick={() => openFavorite(item)}><span>{item.code}</span><small>{item.mode} · {item.command || '（コマンド空欄）'}</small></button>)}</div> : <p className="empty-favorites">{favorites.length ? `${mode}のお気に入りはありません。` : 'Google Driveに接続し、コードの ☆ から登録できます。'}</p>}
      </section>
      <section className="search-panel" aria-labelledby="list-heading"><div className="section-heading"><div><p className="step">02</p><h2 id="list-heading">{mode} のコード</h2></div><strong className="count">{results.length}件</strong></div>
        <div className="search-wrap"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="コード・コマンド・備考を検索" aria-label="コード検索" autoComplete="off" />{query && <button onClick={() => setQuery('')} aria-label="検索をクリア">× クリア</button>}</div>
      </section>
      <div className="code-grid">{results.map((item, index) => {
        const selected = directCode === item.code;
        const urlKey = imageUrlKey(item.mode, item.code);
        const storedImageUrl = imageUrls[urlKey];
        const imageUrl = Object.hasOwn(imageUrls, urlKey) ? storedImageUrl ?? undefined : item.imageUrl;
        const storedNote = notes[urlKey];
        const note = Object.hasOwn(notes, urlKey) ? storedNote ?? undefined : item.note;
        const displayItem = imageUrl === item.imageUrl ? item : { ...item, imageUrl };
        return <article key={`${item.mode}-${item.code}-${index}`} ref={selected ? highlightedRef : undefined} className={`code-card ${item.warning ? 'warning' : ''} ${selected ? 'highlighted' : ''}`}>
          <div className="code-top"><button className="code-number" onClick={() => copyCode(item.code)} title="クリックしてコピー">{item.code}<small>タップしてコピー</small></button><div className="code-tools">{imageUrl && <button className="view-image" onClick={() => setImageItem(displayItem)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v13H4zM7 15l3-3 2.5 2.5 2-2 2.5 2.5M8.5 9a1 1 0 1 0 0 .01" /></svg><span>説明画像を見る</span></button>}<button className={`star ${favoriteSet.has(favoriteKey(item)) ? 'selected' : ''}`} onClick={() => toggleFavorite(item)} aria-label={`${item.code}をお気に入り${favoriteSet.has(favoriteKey(item)) ? '解除' : '登録'}`}>{favoriteSet.has(favoriteKey(item)) ? '★' : '☆'}</button></div></div>
          {item.warning && <span className="warning-label">⚠ 注意が必要なコード</span>}<h3>{item.command || '（コマンド空欄）'}</h3>{note && <p className="note">{note}</p>}<button className="note-edit" onClick={() => setNoteEditor({ item, value: note ?? '' })}>{note ? '備考を編集' : '備考を追加'}</button>
          <div className="card-footer"><span>{item.mode}</span><div className="image-actions"><button onClick={() => prepareImageUrl(item)}>{imageUrl ? '画像URLを変更' : '画像URLを登録'}</button>{imageUrl && <details className="more-menu"><summary aria-label={`${item.code}のその他の画像操作`}>•••</summary><div><button className="image-remove" onClick={() => removeImageUrl(item)}>画像を削除</button></div></details>}</div></div>
        </article>;
      })}</div>
      {!results.length && <div className="no-results"><strong>該当するコードがありません</strong><p>検索語を変えるか、検索をクリアしてください。</p></div>}
    </main>
    {toast && <div className="toast" role="status">{toast}</div>}{imageItem && <ImageModal item={imageItem} onClose={() => setImageItem(undefined)} />}
    {pendingImage && <div className="modal-backdrop" role="presentation"><section className="modal image-confirm" role="dialog" aria-modal="true" aria-labelledby="image-confirm-title"><p className="eyebrow">画像URLの確認</p><h2 id="image-confirm-title">画像URLを登録しますか？</h2><dl><dt>コード</dt><dd>{pendingImage.item.code}</dd><dt>コマンド</dt><dd>{pendingImage.item.command || '（コマンド空欄）'}</dd></dl><p className="confirm-url">{pendingImage.url}</p><div className="confirm-actions"><button onClick={() => setPendingImage(undefined)}>キャンセル</button><button className="confirm-primary" onClick={registerImageUrl}>登録</button></div></section></div>}
    {noteEditor && <div className="modal-backdrop" role="presentation"><section className="modal note-editor" role="dialog" aria-modal="true" aria-labelledby="note-editor-title"><p className="eyebrow">備考の編集</p><h2 id="note-editor-title"><span>{noteEditor.item.code}</span> {noteEditor.item.command || '（コマンド空欄）'}</h2><label htmlFor="note-value">備考</label><textarea id="note-value" value={noteEditor.value} onChange={(event) => setNoteEditor({ ...noteEditor, value: event.target.value })} placeholder="備考を入力してください" autoFocus /><p className="editor-help">空欄で保存すると備考を削除できます。</p><div className="confirm-actions"><button onClick={() => setNoteEditor(undefined)}>キャンセル</button><button className="confirm-primary" onClick={saveEditedNote}>保存</button></div></section></div>}
  </>;
}
export default App;
