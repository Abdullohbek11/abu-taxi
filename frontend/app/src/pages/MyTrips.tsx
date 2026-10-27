import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { IconSend, IconTicket, Star } from '../components/Icons';
import { AssignedDriver, RideRequestCard } from '../components/RideRequestCard';
import { Alert, Button, ConfirmDialog, Empty, ErrorState, Modal, RouteLine, Skeleton, StatusBadge, Tabs, Textarea } from '../components/ui';
import { api } from '../lib/api';
import { errorText } from '../lib/errors';
import { cityName, departure, money } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { useToast } from '../lib/toast';
import type { PassengerBooking, RideRequest } from '../lib/types';
import { ContactBox } from './TripDetail';

export function ReviewModal({ open, onClose, target, onDone }: { open: boolean; onClose: () => void; target: { bookingId?: string; cargoRequestId?: string; rideRequestId?: string }; onDone: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [rating, setRating] = useState(5);
  const [text, setText] = useState('');
  const send = useMutation({
    mutationFn: () => api.post('/reviews', { ...target, rating, ...(text.trim() ? { text: text.trim() } : {}) }),
    onSuccess: () => {
      toast(t('my.reviewThanks'));
      onDone();
      onClose();
    },
  });
  return (
    <Modal open={open} onClose={onClose} title={t('my.reviewTitle')}>
      <div className="stack">
        <div className="row" style={{ justifyContent: 'center', gap: 6 }} role="radiogroup">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={String(n)} onClick={() => setRating(n)} style={{ border: 0, background: 'none', cursor: 'pointer', opacity: n <= rating ? 1 : 0.25, transform: n <= rating ? 'scale(1.05)' : 'none', transition: 'all 150ms' }}>
              <Star size={36} />
            </button>
          ))}
        </div>
        <Textarea label={t('my.reviewText')} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} rows={4} />
        {send.isError ? <Alert kind="error">{errorText(send.error, t)}</Alert> : null}
        <Button size="lg" block loading={send.isPending} onClick={() => send.mutate()}>
          {t('common.save')}
        </Button>
      </div>
    </Modal>
  );
}

/** "So'rovlarim": safar topilmaganda qoldirilgan so'rovlar va biriktirilgan haydovchilar. */
function MyRideRequests() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [cancelling, setCancelling] = useState<RideRequest | null>(null);
  const [reviewFor, setReviewFor] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const q = useInfiniteQuery({
    queryKey: ['rideRequests', 'my'],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      // Faol va tarix bitta ro'yxatda: avval faollar
      const [active, past] = await Promise.all([
        api.page<RideRequest>('/ride-requests/my', { status: 'active', limit: 20, cursor: pageParam }),
        pageParam ? Promise.resolve({ items: [] as RideRequest[] }) : api.page<RideRequest>('/ride-requests/my', { status: 'past', limit: 10 }),
      ]);
      return { items: [...active.items, ...past.items], nextCursor: active.nextCursor };
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: 30_000,
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/ride-requests/${id}/cancel`),
    onSuccess: () => {
      setCancelling(null);
      toast(t('rr.cancelled'));
      void qc.invalidateQueries({ queryKey: ['rideRequests'] });
    },
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  if (q.isPending) return <Skeleton height={140} />;
  if (q.isError) return <ErrorState message={errorText(q.error, t)} onRetry={() => q.refetch()} />;
  if (!items.length) {
    return (
      <Empty
        icon={<IconSend size={26} />}
        title={t('rr.emptyMine')}
        hint={t('rr.emptyMineHint')}
        action={
          <Link to="/search" className="btn btn-primary">
            {t('nav.search')}
          </Link>
        }
      />
    );
  }
  return (
    <div className="stack">
      {items.map((r) => (
        <RideRequestCard key={r.id} r={r}>
          {r.status === 'OPEN' ? (
            <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
              <span className="searching small">
                <span className="pulse-dot" /> {t('rr.searching')}
              </span>
              <Button variant="ghost" size="sm" onClick={() => setCancelling(r)}>
                {t('common.cancel')}
              </Button>
            </div>
          ) : null}
          {r.status === 'ASSIGNED' && r.assignment ? (
            <>
              <AssignedDriver a={r.assignment} profileId={r.driverUserId} />
              <ContactBox contact={{ phone: r.assignment.phone, telegramUsername: r.assignment.telegramUsername }} title={t('rr.contactTitle')} />
              {r.canReview && !reviewed.has(r.id) ? (
                <Button variant="outline" size="sm" style={{ alignSelf: 'flex-start' }} onClick={() => setReviewFor(r.id)}>
                  <Star /> {t('rr.rateDriver')}
                </Button>
              ) : new Date(r.date).getTime() > Date.now() ? (
                <Button variant="ghost" size="sm" style={{ alignSelf: 'flex-start' }} onClick={() => setCancelling(r)}>
                  {t('rr.cancel')}
                </Button>
              ) : null}
            </>
          ) : null}
          {r.status === 'EXPIRED' ? <Alert>{t('rr.expiredHint')}</Alert> : null}
        </RideRequestCard>
      ))}
      {q.hasNextPage ? (
        <Button variant="ghost" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage} style={{ alignSelf: 'center' }}>
          {t('common.more')}
        </Button>
      ) : null}
      <ConfirmDialog
        open={!!cancelling}
        title={t('rr.cancel')}
        message={cancelling?.status === 'ASSIGNED' ? t('rr.cancelAssignedConfirm') : t('rr.cancelConfirm')}
        confirmLabel={t('rr.cancel')}
        danger
        loading={cancel.isPending}
        onClose={() => setCancelling(null)}
        onConfirm={() => cancelling && cancel.mutate(cancelling.id)}
      />
      {reviewFor ? (
        <ReviewModal open onClose={() => setReviewFor(null)} target={{ rideRequestId: reviewFor }} onDone={() => setReviewed((s) => new Set(s).add(reviewFor))} />
      ) : null}
    </div>
  );
}

type MyTab = 'active' | 'past' | 'requests';

export default function MyTrips() {
  const { t, lang } = useI18n();
  const [params, setParams] = useSearchParams();
  const tab = (['active', 'past', 'requests'].includes(params.get('tab') ?? '') ? params.get('tab') : 'active') as MyTab;
  const setTab = (v: MyTab) => setParams(v === 'active' ? {} : { tab: v }, { replace: true });
  const [reviewFor, setReviewFor] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());

  const q = useInfiniteQuery({
    queryKey: ['bookings', 'my', tab],
    enabled: tab !== 'requests',
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.page<PassengerBooking>('/bookings/my', { status: tab, cursor: pageParam, limit: 20 }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="page page-narrow">
      <h1 className="page-title" style={{ marginBottom: 16 }}>
        {t('my.title')}
      </h1>
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'active', label: t('my.active') },
          { value: 'past', label: t('my.past') },
          { value: 'requests', label: t('rr.tab') },
        ]}
      />
      {tab === 'requests' ? (
        <MyRideRequests />
      ) : q.isPending ? (
        <Skeleton height={140} />
      ) : q.isError ? (
        <ErrorState message={errorText(q.error, t)} onRetry={() => q.refetch()} />
      ) : !items.length ? (
        <Empty
          icon={<IconTicket size={26} />}
          title={t('my.empty')}
          hint={t('my.emptyHint')}
          action={
            <Link to="/search" className="btn btn-primary">
              {t('nav.search')}
            </Link>
          }
        />
      ) : (
        <div className="stack">
          {items.map((b) => (
            <div key={b.id} className="card stack" style={{ animation: 'abUp 400ms both' }}>
              <div className="row between" style={{ flexWrap: 'wrap' }}>
                <span className="muted small">{departure(b.trip.departureAt, lang, t)}</span>
                <div className="row" style={{ gap: 6 }}>
                  {b.cancelledLate ? <span className="badge badge-orange">{t('my.cancelledLate')}</span> : null}
                  <StatusBadge status={b.status} />
                </div>
              </div>
              <Link to={`/trips/${b.tripId}`}>
                <RouteLine from={cityName(b.trip.from, lang)} to={cityName(b.trip.to, lang)} />
              </Link>
              <div className="row between small">
                <span className="muted">
                  {b.trip.driver.name} · {b.trip.vehicle.model} · {b.trip.vehicle.plateNumber}
                </span>
                <b className="head-num" style={{ fontSize: 16 }}>
                  {b.seatNumbers.length ? t('seat.numbers', { list: b.seatNumbers.join(', ') }) : t('common.people', { n: b.seats })} · {money(b.totalPrice)} {t('common.som')}
                </b>
              </div>
              {b.contact && b.status === 'CONFIRMED' ? <ContactBox contact={b.contact} title={t('trip.contactTitle')} /> : null}
              {b.status === 'PENDING' ? <Alert>{t('trip.contactHidden')}</Alert> : null}
              {b.status === 'COMPLETED' && !b.reviewed && !reviewed.has(b.id) ? (
                <Button variant="outline" size="sm" style={{ alignSelf: 'flex-start' }} onClick={() => setReviewFor(b.id)}>
                  <Star /> {t('my.review')}
                </Button>
              ) : null}
            </div>
          ))}
          {q.hasNextPage ? (
            <Button variant="ghost" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage} style={{ alignSelf: 'center' }}>
              {t('common.more')}
            </Button>
          ) : null}
        </div>
      )}
      {reviewFor ? (
        <ReviewModal open onClose={() => setReviewFor(null)} target={{ bookingId: reviewFor }} onDone={() => setReviewed((s) => new Set(s).add(reviewFor))} />
      ) : null}
    </div>
  );
}
