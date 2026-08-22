import { getAccessToken } from './auth';
import type { RemoteMode } from '../data/remoteCodes';

export type Favorite = { mode: RemoteMode; code: string };
type Settings = { updatedAt: string; favorites: Favorite[] };
type DriveFile = { id: string };
export type FavoriteChange = { favorite: Favorite; action: 'add' | 'remove' };

const driveApi = 'https://www.googleapis.com/drive/v3';
const driveUploadApi = 'https://www.googleapis.com/upload/drive/v3';
const folderId = '1SWmOnYn98EN5nZs7Jsi3vBLkuJa4B_O6';
const settingsFileName = 'settings.json';
const settingsFileIdKey = 'src-google-drive-settings-file-id';
const emptySettings = (): Settings => ({ updatedAt: new Date(0).toISOString(), favorites: [] });
const key = (favorite: Favorite) => `${favorite.mode}\u0000${favorite.code}`;
const headers = (token: string) => ({ Authorization: `Bearer ${token}` });

async function findSettingsFile(token: string): Promise<string | undefined> {
  const storedId = localStorage.getItem(settingsFileIdKey);
  if (storedId) {
    const response = await fetch(`${driveApi}/files/${encodeURIComponent(storedId)}?fields=id,trashed,parents`, { headers: headers(token), cache: 'no-store' });
    if (response.ok) {
      const file = await response.json() as { id: string; trashed?: boolean; parents?: string[] };
      if (!file.trashed && file.parents?.includes(folderId)) return file.id;
    } else if (response.status !== 404) {
      throw new Error(`Google Driveのファイルを確認できませんでした (${response.status})`);
    }
    localStorage.removeItem(settingsFileIdKey);
  }

  const query = `'${folderId}' in parents and name = '${settingsFileName}' and trashed = false`;
  const params = new URLSearchParams({ q: query, spaces: 'drive', fields: 'files(id)', orderBy: 'modifiedTime desc', pageSize: '1' });
  const response = await fetch(`${driveApi}/files?${params}`, { headers: headers(token), cache: 'no-store' });
  if (!response.ok) throw new Error(`Google Driveからファイルを検索できませんでした (${response.status})`);
  const result = await response.json() as { files?: DriveFile[] };
  const fileId = result.files?.[0]?.id;
  if (fileId) localStorage.setItem(settingsFileIdKey, fileId);
  return fileId;
}

async function read(token: string): Promise<Settings> {
  const fileId = await findSettingsFile(token);
  if (!fileId) return emptySettings();
  const response = await fetch(`${driveApi}/files/${encodeURIComponent(fileId)}?alt=media`, { headers: headers(token), cache: 'no-store' });
  if (response.status === 404) {
    localStorage.removeItem(settingsFileIdKey);
    return emptySettings();
  }
  if (!response.ok) throw new Error(`Google Driveから取得できませんでした (${response.status})`);
  const value = await response.json() as Partial<Settings>;
  return { updatedAt: value.updatedAt ?? new Date(0).toISOString(), favorites: Array.isArray(value.favorites) ? value.favorites : [] };
}

async function write(token: string, settings: Settings): Promise<void> {
  const fileId = await findSettingsFile(token);
  const body = JSON.stringify(settings, null, 2);
  if (fileId) {
    const response = await fetch(`${driveUploadApi}/files/${encodeURIComponent(fileId)}?uploadType=media`, {
      method: 'PATCH', headers: { ...headers(token), 'Content-Type': 'application/json' }, body,
    });
    if (!response.ok) throw new Error(`Google Driveへ上書きできませんでした (${response.status})`);
    return;
  }

  const boundary = `src-${crypto.randomUUID()}`;
  const multipartBody = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: settingsFileName, parents: [folderId], mimeType: 'application/json' })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
  const response = await fetch(`${driveUploadApi}/files?uploadType=multipart&fields=id`, {
    method: 'POST', headers: { ...headers(token), 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipartBody,
  });
  if (!response.ok) throw new Error(`Google Driveへ保存できませんでした (${response.status})`);
  const created = await response.json() as DriveFile;
  localStorage.setItem(settingsFileIdKey, created.id);
}

export async function loadFavorites(interactive = false): Promise<Favorite[]> {
  return (await read(await getAccessToken(interactive))).favorites;
}

// 常に最新ファイルを読み、今回の操作だけを適用するため、古い画面状態による全上書きを避けます。
export async function saveFavoriteChange(change: FavoriteChange): Promise<Favorite[]> {
  const token = await getAccessToken(true);
  const latest = await read(token);
  const merged = new Map(latest.favorites.map((favorite) => [key(favorite), favorite]));
  if (change.action === 'add') merged.set(key(change.favorite), change.favorite);
  else merged.delete(key(change.favorite));
  const settings: Settings = { updatedAt: new Date().toISOString(), favorites: [...merged.values()] };
  await write(token, settings);
  return settings.favorites;
}
