import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IconBox, Star } from '../../components/Icons';
import { Button, ConfirmDialog, Empty, ErrorState, RouteLine, Skeleton, StatusBadge, Tabs } from '../../components/ui';
import { api } from '../../lib/api';
import { errorText } from '../../lib/errors';
import { cityName, dayLabel, money, tashkentDateKey } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import type { Cargo, CargoOffer } from '../../lib/types';
import type { MessageKey } from '../../locales/uz';
import { ReviewModal } from '../MyTrips';
import { MapLinks } from '../../components/LocationPicker';
import { ContactBox } from '../TripDetail';
import { UserChip } from '../../components/ProfileSheet';

function Offers({ cargo }: { cargo: Cargo }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [accepting, setAccepting] = useState<CargoOffer | null>(null);
  const q = useQuery({ queryKey: ['cargo', 'offers', cargo.id], queryFn: () => api.get<CargoOffer[]>(`/cargo/${cargo.id}/offers`) });
  const act = useMutation({
    mutationFn: (path: string) => api.post(path),
    onSuccess: () => {
      setAccepting(null);
      void qc.invalidateQueries({ queryKey: ['cargo'] });
    },
    onError: (err) => toast(errorText(err, t), 'error'),
  });
  if (q.isPending) return <Skeleton height={64} count={1} />;
  if (q.isError) return <span className="field-error">{errorText(q.error, t)}</span>;
  if (!q.data.length) return <span className="small muted">{t('cargo.noOffers')}</span>;
  return (
    <div className="stack-sm">
      {q.data.map((o) => (
        <div key={o.id} className="list-item" style={{ border: '1px solid var(--border)', borderRadius: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <UserChip
              user={o.driver}
              rating={{ avg: o.driver.rating, count: o.driver.ratingCount }}
              sub={`${o.driver.vehicle ? `${o.driver.vehicle.model}, ${o.driver.vehicle.color.toLowerCase()}` : ''}${o.message ? ` · ${o.message}` : ''}`}
            />
          </div>
          <b className="head-num">
            {money(o.price)} {t('common.som')}
          </b>
          {o.status === 'PENDING' && cargo.status === 'OPEN' ? (
            <div className="row" style={{ gap: 6 }}>
              <Button size="sm" variant="success" onClick={() => setAccepting(o)}>
                {t('cargo.accept')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => act.mutate(`/offers/${o.id}/reject`)}>
                {t('common.reject')}
              </Button>
            </div>
          ) : (
            <StatusBadge status={o.status} />
          )}
        </div>
      ))}
      <ConfirmDialog
        open={!!accepting}
        title={t('cargo.accept')}
        message={accepting ? `${t('cargo.acceptConfirm')} (${accepting.driver.name} — ${money(accepting.price)} ${t('common.som')})` : undefined}
        confirmLabel={t('cargo.accept')}
        loading={act.isPending}
        onClose={() => setAccepting(null)}
        onConfirm={() => accepting && act.mutate(`/offers/${accepting.id}/accept`)}
      />
    </div>
  );
}

export default function CargoMy() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<'active' | 'past'>('active');
  const [cancelling, setCancelling] = useState<Cargo | null>(null);
  const [reviewFor, setReviewFor] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['cargo', 'my', tab], queryFn: () => api.page<Cargo>('/cargo/my', { status: tab, limit: 50 }) });
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api.post(path, body),
    onSuccess: () => {
      setCancelling(null);
      void qc.invalidateQueries({ queryKey: ['cargo'] });
    },
    onError: (err) => toast(errorText(err, t), 'error'),
  });

  return (
    <div className="page page-narrow">
      <div className="row between" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        <h1 className="page-title">{t('cargo.myTitle')}</h1>
        <Link to="/cargo/new" className="btn btn-primary">
          {t('cargo.newTitle')}
        </Link>
      </div>
      <Tabs value={tab} onChange={setTab} options={[{ value: 'active', label: t('my.active') }, { value: 'past', label: t('my.past') }]} />
      {q.isPending ? (
        <Skeleton height={140} />
      ) : q.isError ? (
        <ErrorState message={errorText(q.error, t)} onRetry={() => q.refetch()} />
      ) : !q.data.items.length ? (
        <Empty icon={<IconBox size={26} />} title={t('cargo.empty')} action={<Link to="/cargo/new" className="btn btn-primary">{t('cargo.newTitle')}</Link>} />
      ) : (
        <div className="stack">
          {q.data.items.map((c) => (
            <div key={c.id} className="card stack" style={{ animation: 'abUp 400ms both' }}>
              <div className="row between" style={{ flexWrap: 'wrap' }}>
                <span className="row" style={{ gap: 8 }}>
                  <span className="badge badge-yellow">{t(`cargo.${c.type}` as MessageKey)}</span>
                  <span className="small muted">
                    {c.weightKg} kg · {dayLabel(tashkentDateKey(new Date(c.date)), lang, t)}
                  </span>
                </span>
                <StatusBadge status={c.status} />
              </div>
              <RouteLine from={cityName(c.from, lang)} fromSub={c.pickupAddress} to={cityName(c.to, lang)} toSub={c.dropoffAddress} />
              {c.offeredPrice ? (
                <span className="small muted">
                  {t('cargo.price')}: <b className="num">{money(c.offeredPrice)}</b>
                </span>
              ) : null}
              {c.status === 'OPEN' || c.status === 'MATCHED' || c.status === 'IN_TRANSIT' ? (
                <div className="offers-box">
                  <b>
                    {t('cargo.offers')}
                    {c.pendingOffers ? <span className="badge badge-yellow" style={{ marginLeft: 8 }}>{c.pendingOffers}</span> : null}
                  </b>
                  <Offers cargo={c} />
                </div>
              ) : null}
              {(c.location && (c.location.pickupLat != null || c.location.dropoffLat != null)) || c.photos.length ? (
                <details className="more-details">
                  <summary>{t('cargo.detailsToggle')}</summary>
                  <div className="stack" style={{ marginTop: 12 }}>
              {c.location && (c.location.pickupLat != null || c.location.dropoffLat != null) ? (
                <div className="grid-2">
                  {c.location.pickupLat != null ? (
                    <div className="place">
                      <span className="small muted">{t('loc.pickup')}</span>
                      <MapLinks lat={c.location.pickupLat} lng={c.location.pickupLng} />
                    </div>
                  ) : null}
                  {c.location.dropoffLat != null ? (
                    <div className="place">
                      <span className="small muted">{t('loc.dropoff')}</span>
                      <MapLinks lat={c.location.dropoffLat} lng={c.location.dropoffLng} />
                    </div>
                  ) : null}
                </div>
              ) : null}
              {c.photos.length ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(80px,1fr))', gap: 6 }}>
                  {c.photos.map((src) => (
                    <img key={src} src={src} alt="" className="thumb" loading="lazy" />
                  ))}
                </div>
              ) : null}
                  </div>
                </details>
              ) : null}
              {c.contact && c.acceptedOffer ? <ContactBox contact={c.contact} title={`${c.acceptedOffer.driver.name} · ${money(c.acceptedOffer.price)} ${t('common.som')}`} /> : null}
              <div className="row-wrap">
                {c.status === 'MATCHED' || c.status === 'IN_TRANSIT' ? (
                  <Button size="sm" variant="dark" loading={act.isPending} onClick={() => act.mutate({ path: `/cargo/${c.id}/status`, body: { status: 'DELIVERED' } })}>
                    {t('cargo.markDelivered')}
                  </Button>
                ) : null}
                {c.status === 'OPEN' || c.status === 'MATCHED' ? (
                  <Button size="sm" variant="danger" onClick={() => setCancelling(c)}>
                    {t('common.cancel')}
                  </Button>
                ) : null}
                {c.status === 'DELIVERED' && !c.reviewed && reviewFor !== c.id ? (
                  <Button size="sm" variant="outline" onClick={() => setReviewFor(c.id)}>
                    <Star /> {t('my.review')}
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={!!cancelling}
        title={t('common.cancel')}
        message={cancelling ? `${t(`cargo.${cancelling.type}` as MessageKey)} · ${cancelling.weightKg} kg` : undefined}
        confirmLabel={t('common.cancel')}
        danger
        loading={act.isPending}
        onClose={() => setCancelling(null)}
        onConfirm={() => cancelling && act.mutate({ path: `/cargo/${cancelling.id}/cancel` })}
      />
      {reviewFor ? <ReviewModal open onClose={() => setReviewFor(null)} target={{ cargoRequestId: reviewFor }} onDone={() => setReviewFor(null)} /> : null}
    </div>
  );
}
