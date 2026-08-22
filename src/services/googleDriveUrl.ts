export function getGoogleDriveFileId(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'drive.google.com') return undefined;
    return parsed.pathname.match(/\/file\/d\/([^/]+)/)?.[1] ?? parsed.searchParams.get('id') ?? undefined;
  } catch {
    return undefined;
  }
}

export function getGoogleDriveDisplayUrl(url: string): string {
  const fileId = getGoogleDriveFileId(url);
  return fileId ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1600` : url;
}
