import { getAccessToken } from './auth';
import type { RemoteMode } from '../data/remoteCodes';

export type Favorite = { mode: RemoteMode; code: string };
type Settings = { updatedAt: string; favorites: Favorite[] };
export type FavoriteChange = { favorite: Favorite; action: 'add' | 'remove' };
const graphUrl = 'https://graph.microsoft.com/v1.0/me/drive/special/approot:/settings.json:/content';

const key = (favorite: Favorite) => `${favorite.mode}\u0000${favorite.code}`;

async function read(token: string): Promise<Settings> {
  const response = await fetch(graphUrl, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (response.status === 404) return { updatedAt: new Date(0).toISOString(), favorites: [] };
  if (!response.ok) throw new Error(`OneDriveから取得できませんでした (${response.status})`);
  const value = (await response.json()) as Partial<Settings>;
  return { updatedAt: value.updatedAt ?? new Date(0).toISOString(), favorites: Array.isArray(value.favorites) ? value.favorites : [] };
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
  const response = await fetch(graphUrl, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(settings, null, 2) });
  if (!response.ok) throw new Error(`OneDriveへ保存できませんでした (${response.status})`);
  return settings.favorites;
}
