import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { IconSend } from '../../components/Icons';
import { RegionSelect } from '../../components/RegionSelect';
import { RideRequestCard } from '../../components/RideRequestCard';
import { Alert, Button, Empty, ErrorState, Input, Modal, Skeleton } from '../../components/ui';
import { api } from '../../lib/api';
import { errorText } from '../../lib/errors';
import { money } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import type { DriverProfile, RideRequest } from '../../lib/types';
import { ContactBox } from '../TripDetail';
import { ReviewModal } from '../MyTrips';
import { UserChip } from '../../components/ProfileSheet';

/** "Olaman": haydovchi narxni yozadi (kishi boshiga). Taklif narxi bo'lsa — oldindan to'ldiriladi. */
function TakeModal({ r, vehicles, onClose }: { r: RideRequest; vehicles: DriverProfile['vehicles']; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const approved = vehicles.filter((v) => v.status === 'APPROVED');
  const [price, setPrice] = useState(r.offeredPrice ? String(r.offeredPrice) : '');
  const [vehicleId, setVehicleId] = useState(approved[0]?.id ?? '');
  const take = useMutation({
    mutationFn: () => api.post<RideRequest>(`/ride-requests/${r.id}/take`, { pricePerSeat: Number(price), ...(vehicleId ? { vehicleId } : {}) }),
    onSuccess: () => {
      toast(t('rr.takenToast'));
      void qc.invalidateQueries({ queryKey: ['rideRequests'] });
      onClose();
    },
  });
  const valid = Number(price) >= 10_000;
  return (
    <Modal open onClose={onClose} title={t('rr.takeTitle')}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) take.mutate();
        }}
      >
        <RideRequestCard r={r} />
        <Input
          label={t('rr.yourPrice')}
          inputMode="numeric"
          autoFocus
          placeholder="150 000"
          value={price ? Number(price).toLocaleString('ru-RU') : ''}
          onChange={(e) => setPrice(e.target.value.replace(/\D/g, '').slice(0, 7))}
          hint={valid ? t('rr.totalFor', { n: r.seats, sum: money(Number(price) * r.seats) }) : undefined}
          required
        />
        {approved.length > 1 ? (
          <div className="field">
            <span className="field-label">{t('rr.vehicle')}</span>
            <div className="row-wrap" style={{ gap: 8 }}>
              {approved.map((v) => (
                <button type="button" key={v.id} className={`chip ${vehicleId === v.id ? 'on' : ''}`} onClick={() => setVehicleId(v.id)}>
                  {v.model} · {v.plateNumber}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <Alert>{t('rr.takeNote')}</Alert>
        {take.isError ? <Alert kind="error">{errorText(take.error, t)}</Alert> : null}
        <Button type="submit" size="lg" block loading={take.isPending} disabled={!valid}>
          {t('rr.take')}
        </Button>
      </form>
    </Modal>
  );
}

/** Haydovchi kabineti: o'ziga biriktirilgan so'rovlar (yo'lovchi kontakti bilan) va ochiq so'rovlar. */
export function DriverRideRequests({ p }: { p: DriverProfile }) {
  const { t } = useI18n();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [taking, setTaking] = useState<RideRequest | null>(null);
  const [reviewFor, setReviewFor] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const approved = p.status === 'APPROVED';

  const assigned = useQuery({
    queryKey: ['rideRequests', 'assigned'],
    queryFn: () => api.page<RideRequest>('/ride-requests/assigned', { limit: 50 }),
    enabled: approved,
  });
  const open = useQuery({
    queryKey: ['rideRequests', 'open', from, to],
    queryFn: () => api.page<RideRequest>('/ride-requests/open', { from: from || undefined, to: to || undefined, limit: 50 }),
    enabled: approved,
    refetchInterval: 30_000,
  });

  if (!approved) return <Alert kind="warning">{t('rr.driverNotApproved')}</Alert>;

  return (
    <div className="stack" style={{ gap: 20 }}>
      {assigned.data?.items.length ? (
        <section className="stack">
          <h2 className="section-title">{t('rr.assignedToMe')}</h2>
          {assigned.data.items.map((r) => (
            <RideRequestCard key={r.id} r={r} badge={r.pricePerSeat ? <span className="badge">{money(r.pricePerSeat)} {t('common.som')}</span> : null}>
              {r.passengerContact ? <ContactBox contact={r.passengerContact} title={r.passengerContact.name} /> : null}
              {r.canReview && !reviewed.has(r.id) ? (
                <Button size="sm" variant="outline" style={{ alignSelf: 'flex-start' }} onClick={() => setReviewFor(r.id)}>
                  ★ {t('rr.ratePassenger')}
                </Button>
              ) : null}
            </RideRequestCard>
          ))}
        </section>
      ) : null}

      <section className="stack">
        <div className="row-wrap between">
          <h2 className="section-title">{t('rr.openTitle')}</h2>
          <span className="small muted">{t('rr.openHint')}</span>
        </div>
        <div className="ride-req-grid">
          <RegionSelect label={t('common.from')} value={from} onChange={setFrom} />
          <RegionSelect label={t('common.to')} value={to} onChange={setTo} />
        </div>
        {open.isPending ? (
          <Skeleton height={120} />
        ) : open.isError ? (
          <ErrorState message={errorText(open.error, t)} onRetry={() => open.refetch()} />
        ) : !open.data.items.length ? (
          <Empty icon={<IconSend size={26} />} title={t('rr.openEmpty')} hint={t('rr.openEmptyHint')} />
        ) : (
          open.data.items.map((r) => (
            <RideRequestCard key={r.id} r={r}>
              <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
                <UserChip user={r.passenger} rating={r.passenger.clientRating ?? null} size={32} />
                <Button size="sm" onClick={() => setTaking(r)}>
                  🙋 {t('rr.take')}
                </Button>
              </div>
            </RideRequestCard>
          ))
        )}
      </section>
      {taking ? <TakeModal r={taking} vehicles={p.vehicles} onClose={() => setTaking(null)} /> : null}
      {reviewFor ? (
        <ReviewModal open onClose={() => setReviewFor(null)} target={{ rideRequestId: reviewFor }} onDone={() => setReviewed((s) => new Set(s).add(reviewFor))} />
      ) : null}
    </div>
  );
}
