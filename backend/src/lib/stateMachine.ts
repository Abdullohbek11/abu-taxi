import { AppError } from './errors.js';

export type Transitions<S extends string> = Readonly<Record<S, readonly S[]>>;

/** Holat faqat ruxsat etilgan yo'nalishda o'zgaradi, aks holda 409. */
export function assertTransition<S extends string>(map: Transitions<S>, from: S, to: S): void {
  if (!map[from].includes(to)) {
    throw new AppError('INVALID_STATE_TRANSITION', { status: `${from} → ${to}` });
  }
}

export function canTransition<S extends string>(map: Transitions<S>, from: S, to: S): boolean {
  return map[from].includes(to);
}
