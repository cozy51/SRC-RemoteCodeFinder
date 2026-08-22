import { getAccessToken } from './auth';
import type { RemoteMode } from '../data/remoteCodes';

export type Favorite = { mode: RemoteMode; code: string };
export type ImageUrls = Record<string, string | null>;
export type CommandOverrides = Record<string, string | null>;
export type NoteOverrides = Record<string, string | null>;
export type CloudSettings = { favorites: Favorite[]; imageUrls: ImageUrls; commands: CommandOverrides; notes: NoteOverrides; deletedCards: string[] };
type Settings = CloudSettings & { updatedAt: string };
type DriveFile = { id: string };
export type FavoriteChange = { favorite: Favorite; action: 'add' | 'remove' };

const driveApi = 'https://www.googleapis.com/drive/v3';
const driveUploadApi = 'https://www.googleapis.com/upload/drive/v3';
const webAppsDataFolderId = '1SWmOnYn98EN5nZs7Jsi3vBLkuJa4B_O6';
const appFolderName = 'SRC-RemoteCodeFinder';
const appFolderIdKey = 'src-google-drive-app-folder-id';
const settingsFileName = 'settings.json';
const settingsFileIdKey = 'src-google-drive-settings-file-id';
const emptySettings = (): Settings => ({ updatedAt: new Date(0).toISOString(), favorites: [], imageUrls: {}, commands: {}, notes: {}, deletedCards: [] });
const key = (favorite: Favorite) => `${favorite.mode}\u0000${favorite.code}`;
const headers = (token: string) => ({ Authorization: `Bearer ${token}` });
let mutationQueue: Promise<void> = Promise.resolve();

// 設定ファイルへの変更を直列化し、同時操作が古い読み取り結果で新しい変更を上書きするのを防ぎます。
function enqueueMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(mutation, mutation);
  mutationQueue = result.then(() => undefined, () => undefined);
  return result;
}

async function findAppFolder(token: string): Promise<string> {
  const storedId = localStorage.getItem(appFolderIdKey);
  if (storedId) {
    const response = await fetch(`${driveApi}/files/${encodeURIComponent(storedId)}?fields=id,name,mimeType,trashed,parents`, { headers: headers(token), cache: 'no-store' });
    if (response.ok) {
      const folder = await response.json() as { id: string; name: string; mimeType: string; trashed?: boolean; parents?: string[] };
      if (!folder.trashed && folder.name === appFolderName && folder.mimeType === 'application/vnd.google-apps.folder' && folder.parents?.includes(webAppsDataFolderId)) return folder.id;
    } else if (response.status !== 404) {
      throw new Error(`Google Driveの保存先フォルダを確認できませんでした (${response.status})`);
    }
    localStorage.removeItem(appFolderIdKey);
  }

  const query = `'${webAppsDataFolderId}' in parents and name = '${appFolderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const params = new URLSearchParams({ q: query, spaces: 'drive', fields: 'files(id)', orderBy: 'createdTime', pageSize: '1' });
  const search = await fetch(`${driveApi}/files?${params}`, { headers: headers(token), cache: 'no-store' });
  if (!search.ok) throw new Error(`Google Driveから保存先フォルダを検索できませんでした (${search.status})`);
  const existing = (await search.json() as { files?: DriveFile[] }).files?.[0]?.id;
  if (existing) {
    localStorage.setItem(appFolderIdKey, existing);
    return existing;
  }

  const create = await fetch(`${driveApi}/files?fields=id`, {
    method: 'POST',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: appFolderName, mimeType: 'application/vnd.google-apps.folder', parents: [webAppsDataFolderId] }),
  });
  if (!create.ok) throw new Error(`Google Driveに保存先フォルダを作成できませんでした (${create.status})`);
  const created = await create.json() as DriveFile;
  localStorage.setItem(appFolderIdKey, created.id);
  return created.id;
}

async function findSettingsFile(token: string): Promise<string | undefined> {
  const folderId = await findAppFolder(token);
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
  if (fileId) return fileId;

  // 旧バージョンがWebAppsData直下に作成したsettings.jsonは、初回アクセス時にアプリフォルダへ移動します。
  const legacyQuery = `'${webAppsDataFolderId}' in parents and name = '${settingsFileName}' and trashed = false`;
  const legacyParams = new URLSearchParams({ q: legacyQuery, spaces: 'drive', fields: 'files(id)', orderBy: 'modifiedTime desc', pageSize: '1' });
  const legacySearch = await fetch(`${driveApi}/files?${legacyParams}`, { headers: headers(token), cache: 'no-store' });
  if (!legacySearch.ok) throw new Error(`Google Driveから旧設定ファイルを検索できませんでした (${legacySearch.status})`);
  const legacyId = (await legacySearch.json() as { files?: DriveFile[] }).files?.[0]?.id;
  if (!legacyId) return undefined;
  const moveParams = new URLSearchParams({ addParents: folderId, removeParents: webAppsDataFolderId, fields: 'id' });
  const move = await fetch(`${driveApi}/files/${encodeURIComponent(legacyId)}?${moveParams}`, { method: 'PATCH', headers: headers(token) });
  if (!move.ok) throw new Error(`Google Driveの設定ファイルを移動できませんでした (${move.status})`);
  localStorage.setItem(settingsFileIdKey, legacyId);
  return legacyId;
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
  return {
    updatedAt: value.updatedAt ?? new Date(0).toISOString(),
    favorites: Array.isArray(value.favorites) ? value.favorites : [],
    imageUrls: value.imageUrls && typeof value.imageUrls === 'object' ? value.imageUrls : {},
    commands: value.commands && typeof value.commands === 'object' ? value.commands : {},
    notes: value.notes && typeof value.notes === 'object' ? value.notes : {},
    deletedCards: Array.isArray(value.deletedCards) ? value.deletedCards : [],
  };
}

async function write(token: string, settings: Settings): Promise<void> {
  const folderId = await findAppFolder(token);
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

export async function loadCloudSettings(interactive = false): Promise<CloudSettings> {
  const { favorites, imageUrls, commands, notes, deletedCards } = await read(await getAccessToken(interactive));
  return { favorites, imageUrls, commands, notes, deletedCards };
}

// 常に最新ファイルを読み、今回の操作だけを適用するため、古い画面状態による全上書きを避けます。
export async function saveFavoriteChange(change: FavoriteChange): Promise<Favorite[]> {
  return enqueueMutation(async () => {
    const token = await getAccessToken(true);
    const latest = await read(token);
    const merged = new Map(latest.favorites.map((favorite) => [key(favorite), favorite]));
    if (change.action === 'add') merged.set(key(change.favorite), change.favorite);
    else merged.delete(key(change.favorite));
    const settings: Settings = { ...latest, updatedAt: new Date().toISOString(), favorites: [...merged.values()] };
    await write(token, settings);
    return settings.favorites;
  });
}

export async function saveImageUrl(mode: RemoteMode, code: string, imageUrl: string | null): Promise<ImageUrls> {
  return enqueueMutation(async () => {
    const token = await getAccessToken(true);
    const latest = await read(token);
    const imageUrls = { ...latest.imageUrls, [key({ mode, code })]: imageUrl };
    await write(token, { ...latest, updatedAt: new Date().toISOString(), imageUrls });
    return imageUrls;
  });
}

export async function saveNote(mode: RemoteMode, code: string, note: string | null): Promise<NoteOverrides> {
  return enqueueMutation(async () => {
    const token = await getAccessToken(true);
    const latest = await read(token);
    const notes = { ...latest.notes, [key({ mode, code })]: note };
    await write(token, { ...latest, updatedAt: new Date().toISOString(), notes });
    return notes;
  });
}

export async function saveCommand(mode: RemoteMode, code: string, command: string | null): Promise<CommandOverrides> {
  return enqueueMutation(async () => {
    const token = await getAccessToken(true);
    const latest = await read(token);
    const commands = { ...latest.commands, [key({ mode, code })]: command };
    await write(token, { ...latest, updatedAt: new Date().toISOString(), commands });
    return commands;
  });
}

export async function deleteCard(cardKey: string): Promise<string[]> {
  return enqueueMutation(async () => {
    const token = await getAccessToken(true);
    const latest = await read(token);
    const deletedCards = [...new Set([...latest.deletedCards, cardKey])];
    await write(token, { ...latest, updatedAt: new Date().toISOString(), deletedCards });
    return deletedCards;
  });
}

export function imageUrlKey(mode: RemoteMode, code: string): string {
  return key({ mode, code });
}
