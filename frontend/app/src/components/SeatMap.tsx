import { money } from '../lib/format';
import { useI18n } from '../lib/i18n';

/**
 * Mashina sxemasi. O'rinlar 1 dan: 1 — haydovchi yonidagi old o'rin,
 * keyingilari orqa qatorlarda chapdan o'ngga (har qatorda 3 tadan).
 */
type Cell = number | 'driver' | null;

export function seatRows(total: number): Cell[][] {
  const rows: Cell[][] = [['driver', null, total >= 1 ? 1 : null]];
  for (let n = 2; n <= total; n += 3) rows.push([n, n + 1 <= total ? n + 1 : null, n + 2 <= total ? n + 2 : null]);
  return rows;
}

/** Narxlar turlicha bo'lsa — eng arzoni ("...dan") */
export function priceRange(prices: number[], fallback: number) {
  if (!prices.length) return { min: fallback, varies: false };
  const min = Math.min(...prices);
  return { min, varies: prices.some((p) => p !== min) };
}

function Steering() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 14.5V21M9.6 11.3 3.3 9.6M14.4 11.3l6.3-1.7" />
    </svg>
  );
}

type Props = {
  total: number;
  prices: number[];
  /** Boshqalar band qilgan o'rinlar */
  taken?: number[];
  /** Joriy foydalanuvchining o'rinlari */
  mine?: number[];
  selected?: number[];
  /** Berilsa — bo'sh o'rinlar bosiladi */
  onToggle?: (n: number) => void;
  /** Haydovchi ko'rinishi: o'rin egasining ismi */
  labels?: Record<number, string>;
  /** Tahrirlash rejimi: har o'rin narxi (string — input qiymati) */
  editPrices?: string[];
  onPriceChange?: (index: number, value: string) => void;
};

export function SeatMap({ total, prices, taken = [], mine = [], selected = [], onToggle, labels, editPrices, onPriceChange }: Props) {
  const { t } = useI18n();
  const takenSet = new Set(taken);
  const mineSet = new Set(mine);
  const selSet = new Set(selected);
  const editing = !!editPrices;

  const seat = (n: number) => {
    const state = mineSet.has(n) ? 'mine' : takenSet.has(n) ? 'taken' : selSet.has(n) ? 'selected' : 'free';
    const clickable = !editing && !!onToggle && (state === 'free' || state === 'selected');
    const price = prices[n - 1] ?? 0;
    const status = state === 'mine' ? t('seat.mine') : state === 'taken' ? (labels?.[n] ?? t('seat.taken')) : state === 'selected' ? t('seat.selected') : t('seat.free');
    const body = (
      <>
        <span className="seat-no">{n === 1 ? t('seat.front') : t('seat.n', { n })}</span>
        {editing ? (
          <input
            className="seat-price-input num"
            inputMode="numeric"
            aria-label={`${t('seat.n', { n })} — ${t('common.price')}`}
            value={editPrices[n - 1] ? money(Number(editPrices[n - 1])) : ''}
            onChange={(e) => onPriceChange?.(n - 1, e.target.value.replace(/\D/g, '').slice(0, 7))}
            placeholder="150 000"
          />
        ) : (
          <span className="seat-price num">{money(price)}</span>
        )}
        {editing ? null : <span className="seat-status">{status}</span>}
      </>
    );
    const cls = `seat seat-${editing ? 'edit' : state}`;
    return clickable ? (
      <button key={n} type="button" className={cls} aria-pressed={state === 'selected'} onClick={() => onToggle!(n)}>
        {body}
      </button>
    ) : (
      <div key={n} className={cls} aria-label={`${t('seat.n', { n })}: ${status}`}>
        {body}
      </div>
    );
  };

  return (
    <div className="stack-sm">
      <div className="car" role="group" aria-label={t('seat.title')}>
        <div className="car-windshield" aria-hidden />
        {seatRows(total).map((row, i) => (
          <div key={i} className="car-row">
            {row.map((cell, j) =>
              cell === 'driver' ? (
                <div key={j} className="seat seat-driver" aria-label={t('seat.driver')}>
                  <Steering />
                  <span className="seat-status">{t('seat.driver')}</span>
                </div>
              ) : cell === null ? (
                <div key={j} aria-hidden />
              ) : (
                seat(cell)
              ),
            )}
          </div>
        ))}
      </div>
      {editing ? null : (
        <div className="seat-legend small">
          <span>
            <i className="dot dot-free" /> {t('seat.free')}
          </span>
          {onToggle ? (
            <span>
              <i className="dot dot-selected" /> {t('seat.selected')}
            </span>
          ) : null}
          <span>
            <i className="dot dot-taken" /> {t('seat.taken')}
          </span>
          {mine.length ? (
            <span>
              <i className="dot dot-mine" /> {t('seat.mine')}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
