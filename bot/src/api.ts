/**
 * Backend ichki API mijozi. Bot ma'lumotlar bazasiga to'g'ridan-to'g'ri ulanmaydi —
 * faqat shu API orqali (X-Bot-Secret sarlavhasi bilan).
 */
export type Lang = 'UZ' | 'RU';

export interface TelegramProfile {
  telegramId: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  languageCode?: string;
}

export interface LoginCode {
  code: string;
  expiresIn: number;
  isNew: boolean;
  lang: Lang;
}

export interface PendingNotification {
  id: string;
  telegramId: string;
  lang: Lang;
  type: string;
  payload: Record<string, unknown>;
}

/** Safar so'rovi haqida qisqa ma'lumot (bot xabarlari uchun). */
export interface RideSummary {
  requestId: string;
  from: { uz: string; ru: string };
  to: { uz: string; ru: string };
  /** Toshkent kunining boshi, ISO (UTC) */
  date: string;
  seats: number;
  offeredPrice: number | null;
  note: string | null;
}

/** Haydovchi so'rovni oldi: yo'lovchi kontakti. */
export interface RideTaken extends RideSummary {
  passengerName: string;
  phone: string | null;
  telegramUsername: string | null;
  pricePerSeat: number;
}

export interface RideGroupQueue {
  toPost: RideSummary[];
  toClose: { requestId: string; status: string; chatId: string; messageId: number }[];
}

/** Backend xato kodi bilan qaytgan javob (masalan PHONE_REQUIRED, USER_BLOCKED). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryAfter?: number,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

export interface BackendApi {
  requestLoginCode(profile: TelegramProfile): Promise<LoginCode>;
  pendingNotifications(limit: number): Promise<PendingNotification[]>;
  ackNotifications(ids: string[]): Promise<void>;
  rideCheck(id: string, telegramId: string): Promise<RideSummary>;
  rideTake(id: string, telegramId: string, pricePerSeat: number): Promise<RideTaken>;
  rideGroupQueue(): Promise<RideGroupQueue>;
  rideGroupPosted(id: string, chatId: string, messageId: number): Promise<void>;
  rideGroupClosed(id: string): Promise<void>;
}

export function createApi(baseUrl: string, secret: string, fetchImpl: typeof fetch = fetch): BackendApi {
  async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Bot-Secret': secret },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => null)) as { success?: boolean; data?: T; error?: { code?: string } } | null;
    if (!res.ok || !json?.success) {
      const retry = Number(res.headers.get('retry-after'));
      throw new ApiError(res.status, json?.error?.code ?? 'UNKNOWN', Number.isFinite(retry) && retry > 0 ? retry : undefined);
    }
    return json.data as T;
  }

  return {
    requestLoginCode: (profile) => call<LoginCode>('POST', '/internal/bot/login-code', profile),
    pendingNotifications: (limit) => call<PendingNotification[]>('GET', `/internal/bot/notifications?limit=${limit}`),
    ackNotifications: async (ids) => {
      if (ids.length) await call('POST', '/internal/bot/notifications/ack', { ids });
    },
    rideCheck: (id, telegramId) => call<RideSummary>('POST', `/internal/bot/ride-requests/${encodeURIComponent(id)}/check`, { telegramId }),
    rideTake: (id, telegramId, pricePerSeat) =>
      call<RideTaken>('POST', `/internal/bot/ride-requests/${encodeURIComponent(id)}/take`, { telegramId, pricePerSeat }),
    rideGroupQueue: () => call<RideGroupQueue>('GET', '/internal/bot/ride-requests/group-queue'),
    rideGroupPosted: async (id, chatId, messageId) => {
      await call('POST', `/internal/bot/ride-requests/${encodeURIComponent(id)}/group-posted`, { chatId, messageId });
    },
    rideGroupClosed: async (id) => {
      await call('POST', `/internal/bot/ride-requests/${encodeURIComponent(id)}/group-closed`);
    },
  };
}
