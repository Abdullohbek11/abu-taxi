import { getLang } from './i18n';
import type { Me } from './types';

/**
 * API mijozi. Access token faqat xotirada (localStorage emas — XSS'dan himoya);
 * refresh token httpOnly cookie'da (brauzer o'zi yuboradi). 401 TOKEN_EXPIRED bo'lsa
 * bir marta yangilab, so'rovni qaytaradi.
 */
const BASE = '/api/v1';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let accessToken: string | null = null;
export const getAccessToken = () => accessToken;
export function setAccessToken(t: string | null) {
  accessToken = t;
}

type SessionListener = (s: { accessToken: string; user: Me } | null) => void;
let onSession: SessionListener = () => {};
export function onSessionChange(fn: SessionListener) {
  onSession = fn;
}

let refreshing: Promise<boolean> | null = null;

/** Cookie'dagi refresh token bilan yangi access token olish. Bir vaqtda faqat bitta so'rov. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const call = () => fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'same-origin', headers: { 'Accept-Language': getLang().toLowerCase() } });
      let res = await call();
      // Boshqa tab sessiyani hozirgina yangiladi — cookie'da yangi token bor, bir oz kutib qayta urinamiz
      for (let i = 0; i < 2 && res.status === 409; i++) {
        await new Promise((r) => setTimeout(r, 300 + i * 500));
        res = await call();
      }
      if (!res.ok) {
        accessToken = null;
        onSession(null);
        return false;
      }
      const json = await res.json();
      accessToken = json.data.accessToken;
      onSession({ accessToken: json.data.accessToken, user: json.data.user });
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

interface Options {
  body?: unknown;
  form?: FormData;
  query?: Record<string, string | number | boolean | undefined | null>;
}

async function raw(method: string, path: string, opts: Options = {}) {
  const url = new URL(`${BASE}${path}`, window.location.origin);
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  const headers: Record<string, string> = { 'Accept-Language': getLang().toLowerCase() };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  return fetch(url, { method, headers, body, credentials: 'same-origin' });
}

export async function request<T>(method: string, path: string, opts: Options = {}): Promise<{ data: T; meta: Record<string, unknown> }> {
  let res: Response;
  try {
    res = await raw(method, path, opts);
    if (res.status === 401 && accessToken) {
      const peek = await res.clone().json().catch(() => null);
      if (peek?.error?.code === 'TOKEN_EXPIRED' && (await refreshSession())) res = await raw(method, path, opts);
    }
  } catch {
    throw new ApiError(0, 'NETWORK', '');
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    const e = json?.error ?? {};
    // Haydovchi tarifi kerak — qayerda bo'lmasin, to'lov oynasi ko'rsatiladi (Layout tinglaydi)
    if (e.code === 'SUBSCRIPTION_REQUIRED') window.dispatchEvent(new CustomEvent('abutax:subscription-required'));
    throw new ApiError(res.status, e.code ?? 'INTERNAL', e.message ?? res.statusText, e.fields);
  }
  return { data: json.data as T, meta: json.meta ?? {} };
}

/** Fayl yuklab olish (masalan CSV eksport): token bilan so'raladi, brauzerda fayl sifatida saqlanadi. */
export async function download(path: string, fallbackName: string): Promise<void> {
  let res = await raw('GET', path);
  if (res.status === 401 && (await refreshSession())) res = await raw('GET', path);
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new ApiError(res.status, json?.error?.code ?? 'UNKNOWN', json?.error?.message ?? '');
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const api = {
  get: <T>(path: string, query?: Options['query']) => request<T>('GET', path, { query }).then((r) => r.data),
  page: <T>(path: string, query?: Options['query']) =>
    request<T[]>('GET', path, { query }).then((r) => ({ items: r.data, nextCursor: (r.meta.nextCursor as string | null) ?? null, meta: r.meta })),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body }).then((r) => r.data),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body }).then((r) => r.data),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body }).then((r) => r.data),
  del: <T>(path: string) => request<T>('DELETE', path).then((r) => r.data),
  upload: <T>(path: string, form: FormData) => request<T>('POST', path, { form }).then((r) => r.data),
};
