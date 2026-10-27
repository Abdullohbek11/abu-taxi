import { ApiError } from './api';
import type { TFn } from './i18n';

/** Xato matni: backend allaqachon foydalanuvchi tilida xabar beradi (Accept-Language). */
export function errorText(err: unknown, t: TFn): string {
  if (err instanceof ApiError) {
    if (err.code === 'NETWORK') return t('common.networkError');
    if (err.code === 'VALIDATION_ERROR' && err.fields) {
      const first = Object.values(err.fields)[0];
      return first ? `${err.message}: ${first}` : err.message;
    }
    return err.message || t('common.error');
  }
  return t('common.error');
}

export function fieldErrors(err: unknown): Record<string, string> {
  return err instanceof ApiError && err.fields ? err.fields : {};
}
