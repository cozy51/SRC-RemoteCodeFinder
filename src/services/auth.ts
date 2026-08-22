const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const scope = 'https://www.googleapis.com/auth/drive';
const tokenKey = 'src-google-access-token';
const googleIdentityScript = 'https://accounts.google.com/gsi/client';

type TokenResponse = { access_token?: string; expires_in?: number; error?: string };
type TokenClient = { requestAccessToken: (options?: { prompt?: string }) => void };
type GoogleAccounts = {
  oauth2: {
    initTokenClient: (config: {
      client_id: string;
      scope: string;
      callback: (response: TokenResponse) => void;
      error_callback: () => void;
    }) => TokenClient;
  };
};

declare global {
  interface Window { google?: { accounts: GoogleAccounts } }
}

export const isCloudConfigured = Boolean(clientId);
let scriptPromise: Promise<void> | undefined;

function loadGoogleIdentityServices(): Promise<void> {
  if (window.google) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${googleIdentityScript}"]`);
    const script = existing ?? document.createElement('script');
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('Google認証を読み込めませんでした')), { once: true });
    if (!existing) {
      script.src = googleIdentityScript;
      script.async = true;
      document.head.append(script);
    }
  });
  return scriptPromise;
}

export async function getAccessToken(interactive = false): Promise<string> {
  if (!clientId) throw new Error('Google Drive連携が設定されていません');
  const stored = JSON.parse(sessionStorage.getItem(tokenKey) ?? 'null') as { accessToken: string; expiresAt: number } | null;
  if (stored && stored.expiresAt > Date.now() + 60_000) return stored.accessToken;
  if (!interactive) throw new Error('Google Driveに接続してください');

  await loadGoogleIdentityServices();
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope,
      callback: (response) => {
        if (!response.access_token) {
          reject(new Error(response.error ? `Google認証に失敗しました (${response.error})` : 'Google認証に失敗しました'));
          return;
        }
        const expiresAt = Date.now() + (response.expires_in ?? 3600) * 1000;
        sessionStorage.setItem(tokenKey, JSON.stringify({ accessToken: response.access_token, expiresAt }));
        resolve(response.access_token);
      },
      error_callback: () => reject(new Error('Google認証を完了できませんでした')),
    });
    client.requestAccessToken({ prompt: 'consent' });
  });
}
