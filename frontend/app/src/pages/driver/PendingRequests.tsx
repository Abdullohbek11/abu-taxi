import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui';
import { api } from '../../lib/api';
import { errorText } from '../../lib/errors';
import { cityName, departure, money } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import type { PendingDriverBooking } from '../../lib/types';
import { UserChip } from '../../components/ProfileSheet';

/**
 * Haydovchi kabineti tepasida: tasdiqlanmagan so'rovlar (barcha safarlardan) —
 * tasdiqlanmaguncha shu yerda turadi, shu yerning o'zida tasdiqlash/rad etish mumkin.
 */
export function PendingRequests() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['driver', 'pending'],
    queryFn: () => api.get<PendingDriverBooking[]>('/bookings/pending-for-driver'),
    refetchInterval: 30_000,
  });
  const act = useMutation({
    mutationFn: (path: string) => api.post(path),
    onSuccess: (_d, path) => {
      toast(path.endsWith('/confirm') ? t('drv.reqConfirmed') : t('drv.reqRejected'));
      void qc.invalidateQueries({ queryKey: ['driver'] });
      void qc.invalidateQueries({ queryKey: ['trip'] });
    },
    onError: (err) => toast(errorText(err, t), 'error'),
  });

  const list = q.data ?? [];
  if (!list.length) return null;
  return (
    <section className="pending-box" aria-live="polite">
      <div className="row between" style={{ flexWrap: 'wrap' }}>
        <b style={{ fontFamily: 'var(--font-head)', fontSize: 18 }}>⏳ {t('drv.pendingTitle', { n: list.length })}</b>
        <span className="small muted">{t('drv.pendingHint')}</span>
      </div>
      <div className="stack-sm">
        {list.map((b) => (
          <div key={b.id} className="pending-item">
            <div style={{ flex: 1, minWidth: 180 }}>
              <UserChip user={b.passenger} rating={b.passenger.clientRating ?? null} sub={b.seatNumbers.length ? t('seat.numbers', { list: b.seatNumbers.join(', ') }) : t('common.people', { n: b.seats })} />
              <Link to={`/driver/trips/${b.trip.id}`} className="small muted" style={{ textDecoration: 'underline' }}>
                {cityName(b.trip.from, lang)} → {cityName(b.trip.to, lang)} · {departure(b.trip.departureAt, lang, t)}
              </Link>
              {b.pickupAddress ? <div className="small muted">📍 {b.pickupAddress}</div> : null}
            </div>
            <b className="head-num">
              {money(b.totalPrice)} {t('common.som')}
            </b>
            <div className="row" style={{ gap: 6 }}>
              <Button size="sm" variant="success" disabled={act.isPending} onClick={() => act.mutate(`/bookings/${b.id}/confirm`)}>
                {t('common.confirm')}
              </Button>
              <Button size="sm" variant="ghost" disabled={act.isPending} onClick={() => act.mutate(`/bookings/${b.id}/reject`)}>
                {t('common.reject')}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
