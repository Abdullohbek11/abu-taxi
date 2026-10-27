import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { IconBox } from '../../components/Icons';
import { Alert, Button, Empty, ErrorState, Input, Modal, RouteLine, Skeleton, StatusBadge, Tabs, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import { errorText, fieldErrors } from '../../lib/errors';
import { cityName, dayLabel, money, tashkentDateKey } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import type { Cargo, CargoOffer } from '../../lib/types';
import type { MessageKey } from '../../locales/uz';
import { MapLinks } from '../../components/LocationPicker';
import { ContactBox } from '../TripDetail';
import { UserChip } from '../../components/ProfileSheet';
import { ReviewModal } from '../MyTrips';

function CargoSummary({ c }: { c: Cargo }) {
  const { t, lang } = useI18n();
  return (
    <>
      <div className="row between" style={{ flexWrap: 'wrap' }}>
        <span className="row" style={{ gap: 8 }}>
          <span className="badge badge-yellow">{t(`cargo.${c.type}` as MessageKey)}</span>
          <span className="small muted">
            {c.weightKg} kg
            {c.lengthCm && c.widthCm && c.heightCm ? ` · ${c.lengthCm}×${c.widthCm}×${c.heightCm} sm` : ''} · {dayLabel(tashkentDateKey(new Date(c.date)), lang, t)}
          </span>
        </span>
        {c.offeredPrice ? (
          <b className="head-num">
            {money(c.offeredPrice)} {t('common.som')}
          </b>
        ) : null}
      </div>
      <RouteLine from={cityName(c.from, lang)} fromSub={c.pickupAddress} to={cityName(c.to, lang)} toSub={c.dropoffAddress} />
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
      {c.description ? <p style={{ margin: 0 }}>{c.description}</p> : null}
      {c.photos.length ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(80px,1fr))', gap: 6 }}>
          {c.photos.map((src) => (
            <img key={src} src={src} alt="" className="thumb" loading="lazy" />
          ))}
        </div>
      ) : null}
    </>
  );
}

function OpenList() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [offerFor, setOfferFor] = useState<Cargo | null>(null);
  const [price, setPrice] = useState('');
  const [message, setMessage] = useState('');
  const q = useQuery({ queryKey: ['cargo', 'open'], queryFn: () => api.page<Cargo>('/cargo/open', { limit: 50 }) });
  const send = useMutation({
    mutationFn: () => api.post(`/cargo/${offerFor!.id}/offers`, { price: Number(price), ...(message.trim() ? { message: message.trim() } : {}) }),
    onSuccess: () => {
      toast(t('cargo.offerSent'));
      setOfferFor(null);
      void qc.invalidateQueries({ queryKey: ['offers'] });
      void qc.invalidateQueries({ queryKey: ['cargo'] });
    },
  });
  const fe = fieldErrors(send.error);
  if (q.isPending) return <Skeleton height={160} />;
  if (q.isError) return <ErrorState message={errorText(q.error, t)} onRetry={() => q.refetch()} />;
  if (!q.data.items.length) return <Empty icon={<IconBox size={26} />} title={t('cargo.empty')} />;
  return (
    <div className="stack">
      {q.data.items.map((c) => (
        <div key={c.id} className="card stack" style={{ animation: 'abUp 400ms both' }}>
          <CargoSummary c={c} />
          <div className="row between">
            <UserChip user={c.sender} rating={c.sender.clientRating ?? null} size={32} sub={c.pendingOffers ? `${t('cargo.offers')}: ${c.pendingOffers}` : undefined} />
            {c.myOffer ? (
              <span className="badge badge-green">
                {t('cargo.yourOffer')}: {money(c.myOffer.price)} {t('common.som')}
              </span>
            ) : (
            <Button
              size="sm"
              onClick={() => {
                setOfferFor(c);
                setPrice(c.offeredPrice ? String(c.offeredPrice) : '');
                setMessage('');
                send.reset();
              }}
            >
              {t('cargo.makeOffer')}
            </Button>
            )}
          </div>
        </div>
      ))}
      <Modal open={!!offerFor} onClose={() => setOfferFor(null)} title={t('cargo.makeOffer')}>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            send.mutate();
          }}
        >
          <Input label={t('cargo.yourPrice')} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, '').slice(0, 9))} required hint={price ? `${money(Number(price))} ${t('common.som')}` : undefined} error={fe.price} />
          <Textarea label={`${t('cargo.message')} (${t('common.optional')})`} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} rows={3} placeholder={t('cargo.offerMsgPh')} />
          {send.isError && !Object.keys(fe).length ? <Alert kind="error">{errorText(send.error, t)}</Alert> : null}
          <Button size="lg" type="submit" loading={send.isPending} disabled={!price}>
            {t('cargo.makeOffer')}
          </Button>
        </form>
      </Modal>
    </div>
  );
}

function MyOffers() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<'active' | 'past'>('active');
  const [reviewFor, setReviewFor] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['offers', 'my', status], queryFn: () => api.page<CargoOffer>('/offers/my', { status, limit: 50 }) });
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api.post(path, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['offers'] });
      void qc.invalidateQueries({ queryKey: ['cargo'] });
    },
    onError: (err) => toast(errorText(err, t), 'error'),
  });
  return (
    <div className="stack">
      <Tabs value={status} onChange={setStatus} options={[{ value: 'active', label: t('my.active') }, { value: 'past', label: t('my.past') }]} />
      {q.isPending ? (
        <Skeleton height={140} />
      ) : q.isError ? (
        <ErrorState message={errorText(q.error, t)} onRetry={() => q.refetch()} />
      ) : !q.data.items.length ? (
        <Empty icon={<IconBox size={26} />} title={t('cargo.noOffers')} />
      ) : (
        q.data.items.map((o) =>
          o.cargo ? (
            <div key={o.id} className="card stack">
              <div className="row between">
                <b className="head-num">{t('cargo.offered', { price: money(o.price) })}</b>
                <StatusBadge status={o.status} />
              </div>
              <CargoSummary c={o.cargo} />
              {o.cargo.contact ? <ContactBox contact={o.cargo.contact} title={o.cargo.sender.name} /> : null}
              <div className="row-wrap">
                {o.status === 'PENDING' ? (
                  <Button size="sm" variant="ghost" onClick={() => act.mutate({ path: `/offers/${o.id}/withdraw` })}>
                    {t('cargo.withdraw')}
                  </Button>
                ) : null}
                {o.status === 'ACCEPTED' && o.cargo.status === 'MATCHED' ? (
                  <Button size="sm" loading={act.isPending} onClick={() => act.mutate({ path: `/cargo/${o.cargo!.id}/status`, body: { status: 'IN_TRANSIT' } })}>
                    {t('cargo.markInTransit')}
                  </Button>
                ) : null}
                {o.status === 'ACCEPTED' && o.cargo.status === 'IN_TRANSIT' ? (
                  <Button size="sm" variant="dark" loading={act.isPending} onClick={() => act.mutate({ path: `/cargo/${o.cargo!.id}/status`, body: { status: 'DELIVERED' } })}>
                    {t('cargo.markDelivered')}
                  </Button>
                ) : null}
                {o.status === 'ACCEPTED' && o.cargo.status === 'DELIVERED' && !o.cargo.reviewed ? (
                  <Button size="sm" variant="outline" onClick={() => setReviewFor(o.cargo!.id)}>
                    ★ {t('cargo.rateSender')}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null,
        )
      )}
      {reviewFor ? (
        <ReviewModal open onClose={() => setReviewFor(null)} target={{ cargoRequestId: reviewFor }} onDone={() => void qc.invalidateQueries({ queryKey: ['offers'] })} />
      ) : null}
    </div>
  );
}

export default function DriverCargo() {
  const { t } = useI18n();
  const [tab, setTab] = useState<'open' | 'mine'>('open');
  return (
    <div className="page page-narrow stack">
      <h1 className="page-title">{t('cargo.openTitle')}</h1>
      <Tabs value={tab} onChange={setTab} options={[{ value: 'open', label: t('cargo.openTitle') }, { value: 'mine', label: t('cargo.myOffers') }]} />
      {tab === 'open' ? <OpenList /> : <MyOffers />}
    </div>
  );
}
