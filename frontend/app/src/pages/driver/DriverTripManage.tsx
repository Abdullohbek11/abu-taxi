import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { useState } from 'react';
import { MapLinks } from '../../components/LocationPicker';
import { priceRange, SeatMap } from '../../components/SeatMap';
import { Alert, Button, ConfirmDialog, Empty, ErrorState, RouteLine, Skeleton, StatusBadge } from '../../components/ui';
import { api } from '../../lib/api';
import { errorText } from '../../lib/errors';
import { cityName, departure, money } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import type { DriverBooking, TripDetail } from '../../lib/types';
import { ContactBox } from '../TripDetail';
import { UserChip } from '../../components/ProfileSheet';
import { ReviewModal } from '../MyTrips';

/** Haydovchi: safardagi so'rovlarni tasdiqlash/rad etish va safar holatini boshqarish */
export default function DriverTripManage() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [reviewFor, setReviewFor] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const trip = useQuery({ queryKey: ['trip', id, 'driver'], queryFn: () => api.get<TripDetail>(`/trips/${id}`) });
  const bookings = useQuery({ queryKey: ['driver', 'bookings', id], queryFn: () => api.get<DriverBooking[]>(`/trips/${id}/bookings`) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['driver'] });
    void qc.invalidateQueries({ queryKey: ['trip', id] });
  };
  const act = useMutation({
    mutationFn: (path: string) => api.post(path),
    onSuccess: () => {
      setConfirmCancel(false);
      refresh();
    },
    onError: (err) => toast(errorText(err, t), 'error'),
  });

  if (trip.isPending || bookings.isPending) return <div className="page"><Skeleton height={140} /></div>;
  if (trip.isError) return <div className="page page-narrow"><ErrorState message={errorText(trip.error, t)} onRetry={() => trip.refetch()} /></div>;
  const tr = trip.data;
  const list = bookings.data ?? [];
  // Sxemada band o'rin ustida yo'lovchi ismi
  const labels: Record<number, string> = {};
  for (const b of list) if (b.status === 'PENDING' || b.status === 'CONFIRMED' || b.status === 'COMPLETED') for (const n of b.seatNumbers) labels[n] = b.passenger.name.split(' ')[0] ?? '';
  const range = priceRange(tr.seatPrices, tr.pricePerSeat);

  return (
    <div className="page page-narrow stack" style={{ gap: 20 }}>
      <div className="card card-lg stack">
        <div className="row between">
          <span className="muted">{departure(tr.departureAt, lang, t)}</span>
          <StatusBadge status={tr.status} />
        </div>
        <RouteLine from={cityName(tr.from, lang)} to={cityName(tr.to, lang)} />
        <div className="row between small">
          <span>{t('drv.booked', { booked: tr.totalSeats - tr.availableSeats, total: tr.totalSeats })}</span>
          <b className="head-num">
            {range.varies ? t('seat.from', { price: money(range.min) }) : money(range.min)} {t('common.perSeat')}
          </b>
        </div>
        <SeatMap total={tr.totalSeats} prices={tr.seatPrices} taken={tr.takenSeats} labels={labels} />
        <div className="row-wrap">
          {tr.status === 'SCHEDULED' ? (
            <>
              <Button size="sm" loading={act.isPending} onClick={() => act.mutate(`/trips/${id}/start`)}>{t('drv.start')}</Button>
              <Button size="sm" variant="danger" onClick={() => setConfirmCancel(true)}>{t('drv.cancelTrip')}</Button>
            </>
          ) : null}
          {tr.status === 'IN_PROGRESS' ? <Button size="sm" variant="dark" loading={act.isPending} onClick={() => act.mutate(`/trips/${id}/complete`)}>{t('drv.complete')}</Button> : null}
        </div>
      </div>
      <h3 style={{ fontSize: 20 }}>{t('drv.requests')}</h3>
      {bookings.isError ? <Alert kind="error">{errorText(bookings.error, t)}</Alert> : null}
      {!list.length ? <Empty title={t('drv.noRequests')} /> : list.map((b) => (
        <div key={b.id} className={`card stack-sm${b.status === 'PENDING' ? ' card-pending' : ''}`}>
          <div className="row between">
            <UserChip user={b.passenger} rating={b.passenger.clientRating ?? null} size={36} />
            <StatusBadge status={b.status} />
          </div>
          <div className="small muted">
            {b.seatNumbers.length ? t('seat.numbers', { list: b.seatNumbers.join(', ') }) : t('common.people', { n: b.seats })} · {money(b.totalPrice)} {t('common.som')}
          </div>
          {b.pickupAddress || b.pickupLat != null ? (
            <div className="place">
              <span className="small muted">{t('loc.pickup')}</span>
              {b.pickupAddress ? <b>{b.pickupAddress}</b> : null}
              <MapLinks lat={b.pickupLat} lng={b.pickupLng} />
            </div>
          ) : null}
          {b.dropoffAddress || b.dropoffLat != null ? (
            <div className="place">
              <span className="small muted">{t('loc.dropoff')}</span>
              {b.dropoffAddress ? <b>{b.dropoffAddress}</b> : null}
              <MapLinks lat={b.dropoffLat} lng={b.dropoffLng} />
            </div>
          ) : null}
          {b.status === 'PENDING' && (b.pickupAddress || b.dropoffAddress) ? <span className="small faint">{t('loc.hiddenUntilConfirm')}</span> : null}
          {b.comment ? <p style={{ margin: 0 }}>{b.comment}</p> : null}
          {b.contact ? <ContactBox contact={b.contact} title={t('trip.contactPassenger')} /> : null}
          {b.status === 'COMPLETED' && !b.reviewed && !reviewed.has(b.id) ? (
            <Button size="sm" variant="outline" style={{ alignSelf: 'flex-start' }} onClick={() => setReviewFor(b.id)}>
              ★ {t('rr.ratePassenger')}
            </Button>
          ) : null}
          {b.status === 'PENDING' ? (
            <div className="row-wrap">
              <Button size="sm" variant="success" loading={act.isPending} onClick={() => act.mutate(`/bookings/${b.id}/confirm`)}>{t('common.confirm')}</Button>
              <Button size="sm" variant="danger" onClick={() => act.mutate(`/bookings/${b.id}/reject`)}>{t('common.reject')}</Button>
            </div>
          ) : null}
        </div>
      ))}
      {reviewFor ? (
        <ReviewModal open onClose={() => setReviewFor(null)} target={{ bookingId: reviewFor }} onDone={() => setReviewed((s) => new Set(s).add(reviewFor))} />
      ) : null}
      <ConfirmDialog
        open={confirmCancel}
        title={t('drv.cancelTrip')}
        message={t('drv.cancelTripConfirm')}
        confirmLabel={t('drv.cancelTrip')}
        danger
        loading={act.isPending}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => act.mutate(`/trips/${id}/cancel`)}
      />
    </div>
  );
}
