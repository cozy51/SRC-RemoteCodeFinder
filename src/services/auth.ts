const clientId = import.meta.env.VITE_AZURE_CLIENT_ID as string | undefined;
const tenantId = (import.meta.env.VITE_AZURE_TENANT_ID as string | undefined) || 'common';
const redirectUri = (import.meta.env.VITE_AZURE_REDIRECT_URI as string | undefined) || window.location.origin;

export const isCloudConfigured = Boolean(clientId);
const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
const scopes = 'Files.ReadWrite.AppFolder offline_access';
type Token = { access_token: string; expires_in: number; refresh_token?: string };
const tokenKey = 'src-graph-token';
const verifierKey = 'src-pkce-verifier';

const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
async function challenge(verifier: string) { return encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))); }
async function exchange(body: URLSearchParams): Promise<string> {
  const response = await fetch(tokenEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!response.ok) throw new Error('Microsoft認証を完了できませんでした');
  const token = await response.json() as Token;
  sessionStorage.setItem(tokenKey, JSON.stringify({ ...token, expiresAt: Date.now() + token.expires_in * 1000 }));
  return token.access_token;
}

// SPA向けAuthorization Code + PKCE。トークンはタブのセッション内だけに保持します。
export async function handleAuthCallback(): Promise<boolean> {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  if (!code || !window.opener) return false;
  const verifier = sessionStorage.getItem(verifierKey);
  if (!verifier || !clientId) return false;
  const accessToken = await exchange(new URLSearchParams({ client_id: clientId, grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier, scope: scopes }));
  window.opener.postMessage({ type: 'src-auth-token', accessToken, stored: sessionStorage.getItem(tokenKey) }, location.origin);
  window.close();
  return true;
}

export async function getAccessToken(interactive = false): Promise<string> {
  if (!clientId) throw new Error('Microsoft Graph が設定されていません');
  const stored = JSON.parse(sessionStorage.getItem(tokenKey) ?? 'null') as (Token & { expiresAt: number }) | null;
  if (stored && stored.expiresAt > Date.now() + 60_000) return stored.access_token;
  if (stored?.refresh_token) return exchange(new URLSearchParams({ client_id: clientId, grant_type: 'refresh_token', refresh_token: stored.refresh_token, redirect_uri: redirectUri, scope: scopes }));
  if (!interactive) throw new Error('OneDriveにサインインしてください');
  const verifier = encode(crypto.getRandomValues(new Uint8Array(48)));
  sessionStorage.setItem(verifierKey, verifier);
  const url = new URL(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`);
  url.search = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: redirectUri, response_mode: 'query', scope: scopes, code_challenge: await challenge(verifier), code_challenge_method: 'S256' }).toString();
  const popup = window.open(url, 'src-onedrive-auth', 'popup,width=520,height=700');
  if (!popup) throw new Error('認証ポップアップを開けませんでした');
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => { window.removeEventListener('message', receive); reject(new Error('Microsoft認証がタイムアウトしました')); }, 120_000);
    function receive(event: MessageEvent) {
      if (event.origin !== location.origin || event.data?.type !== 'src-auth-token') return;
      clearTimeout(timeout); window.removeEventListener('message', receive);
      sessionStorage.setItem(tokenKey, event.data.stored); resolve(event.data.accessToken);
    }
    window.addEventListener('message', receive);
  });
}
