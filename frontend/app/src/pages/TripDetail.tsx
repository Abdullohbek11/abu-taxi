import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { IconBox, IconCar, IconHome, IconPhone, IconSend, Star } from '../components/Icons';
import { MapLinks, PlaceField, type LatLng } from '../components/LocationPicker';
import { priceRange, SeatMap } from '../components/SeatMap';
import { Alert, Button, Empty, ErrorState, Modal, RouteLine, Skeleton, StatusBadge, Textarea } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { errorText, fieldErrors } from '../lib/errors';
import { cityName, departure, money, phoneDisplay, relativeTime, time } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { regionCenterCoords, useCities } from '../lib/queries';
import { useToast } from '../lib/toast';
import type { Contact, TripDetail as TripDetailT } from '../lib/types';
import { UserChip } from '../components/ProfileSheet';

export function ContactBox({ contact, title }: { contact: Contact; title: string }) {
  const { t } = useI18n();
  return (
    <div className="contact">
      <b style={{ color: 'var(--success)' }}>{title}</b>
      {contact.phone ? (
        <div className="head-num" style={{ fontSize: 20 }}>
          {phoneDisplay(contact.phone)}
        </div>
      ) : null}
      <div className="row-wrap">
        {contact.phone ? (
          <a className="btn btn-success" href={`tel:${contact.phone}`}>
            <IconPhone size={18} /> {t('trip.call')}
          </a>
        ) : null}
        {contact.telegramUsername ? (
          <a className="btn btn-dark" href={`https://t.me/${contact.telegramUsername}`} target="_blank" rel="noreferrer">
            <IconSend /> {t('trip.telegram')}
          </a>
        ) : null}
      </div>
    </div>
  );
}

const ACTIVE = new Set(['PENDING', 'CONFIRMED']);

export default function TripDetail() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const loc = useLocation();
  const qc = useQueryClient();
  const toast = useToast();
  const [selected, setSelected] = useState<number[]>([]);
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickup, setPickup] = useState<LatLng | null>(null);
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [dropoff, setDropoff] = useState<LatLng | null>(null);
  const { data: cities } = useCities();
  const [comment, setComment] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);

  // Boshqalar band qilgan o'rinlar ko'rinib turishi uchun vaqti-vaqti bilan yangilanadi
  const q = useQuery({ queryKey: ['trip', id, user?.id], queryFn: () => api.get<TripDetailT>(`/trips/${id}`), enabled: !!id, refetchInterval: 30_000 });
  const trip = q.data;

  const book = useMutation({
    mutationFn: () =>
      api.post('/bookings', {
        tripId: id,
        seatNumbers: selected,
        ...(trip?.pickupFromHome && pickupAddress.trim() ? { pickupAddress: pickupAddress.trim() } : {}),
        ...(trip?.pickupFromHome && pickup ? { pickupLat: pickup.lat, pickupLng: pickup.lng } : {}),
        ...(dropoffAddress.trim() ? { dropoffAddress: dropoffAddress.trim() } : {}),
        ...(dropoff ? { dropoffLat: dropoff.lat, dropoffLng: dropoff.lng } : {}),
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      }),
    onSuccess: () => {
      toast(t('trip.booked'));
      setSelected([]);
      void qc.invalidateQueries({ queryKey: ['trip', id] });
      void qc.invalidateQueries({ queryKey: ['bookings'] });
    },
    // Kimdir o'rinni oldinroq olgan bo'lsa — sxemani yangilaymiz
    onError: (err) => {
      if (err instanceof ApiError && (err.code === 'SEAT_TAKEN' || err.code === 'TRIP_FULL')) {
        setSelected([]);
        void qc.invalidateQueries({ queryKey: ['trip', id] });
      }
    },
  });
  const cancel = useMutation({
    mutationFn: (bookingId: string) => api.post(`/bookings/${bookingId}/cancel`),
    onSuccess: () => {
      setConfirmCancel(false);
      void qc.invalidateQueries({ queryKey: ['trip', id] });
      void qc.invalidateQueries({ queryKey: ['bookings'] });
    },
    onError: (err) => toast(errorText(err, t), 'error'),
  });

  if (q.isPending) return <div className="page"><Skeleton height={160} count={3} /></div>;
  if (q.isError)
    return (
      <div className="page page-narrow">
        {q.error instanceof ApiError && q.error.status === 404 ? <Empty title={t('trip.notFound')} action={<Link to="/search" className="btn btn-primary">{t('nav.search')}</Link>} /> : <ErrorState message={errorText(q.error, t)} onRetry={() => q.refetch()} />}
      </div>
    );
  if (!trip) return null;

  const mine = trip.myBooking && ACTIVE.has(trip.myBooking.status) ? trip.myBooking : null;
  const isOwn = user?.id === trip.driver.id;
  const late = new Date(trip.departureAt).getTime() - Date.now() < 2 * 3600_000;
  const plate = trip.myBooking?.fullPlateNumber ?? trip.vehicle.plateNumber;
  const bookErr = fieldErrors(book.error);
  const mySeats = mine?.seatNumbers ?? [];
  const canPick = !!user && !isOwn && !mine && trip.status === 'SCHEDULED' && new Date(trip.departureAt) > new Date() && trip.availableSeats > 0;
  const toggle = (n: number) => setSelected((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n].sort((a, b) => a - b)));
  const total = selected.reduce((sum, n) => sum + (trip.seatPrices[n - 1] ?? trip.pricePerSeat), 0);
  const range = priceRange(trip.seatPrices, trip.pricePerSeat);
  const seatMap = (
    <div className="stack-sm">
      <b style={{ fontFamily: 'var(--font-head)', fontSize: 18 }}>{canPick ? t('seat.title') : t('seat.mapTitle')}</b>
      {canPick ? <span className="small muted">{t('seat.hint')}</span> : null}
      <SeatMap
        total={trip.totalSeats}
        prices={trip.seatPrices}
        taken={trip.takenSeats.filter((n) => !mySeats.includes(n))}
        mine={mySeats}
        selected={selected}
        onToggle={canPick ? toggle : undefined}
      />
    </div>
  );

  let panel: React.ReactNode;
  if (isOwn) {
    panel = (
      <div className="stack">
        <Alert>{t('trip.ownTrip')}</Alert>
        <Link to={`/driver/trips/${trip.id}`} className="btn btn-dark btn-block">
          {t('drv.requests')}
        </Link>
      </div>
    );
  } else if (mine) {
    panel = (
      <div className="stack">
        <div className="row between">
          <b>{t('trip.yourBooking')}</b>
          <StatusBadge status={mine.status} />
        </div>
        <div className="row between muted">
          <span>{mine.seatNumbers.length ? t('seat.numbers', { list: mine.seatNumbers.join(', ') }) : t('common.people', { n: mine.seats })}</span>
          <b className="head-num">
            {money(mine.totalPrice)} {t('common.som')}
          </b>
        </div>
        {mine.pickupAddress || mine.pickupLat != null ? (
          <div className="place">
            <span className="small muted">{t('loc.pickup')}</span>
            {mine.pickupAddress ? <b>{mine.pickupAddress}</b> : null}
            <MapLinks lat={mine.pickupLat} lng={mine.pickupLng} />
          </div>
        ) : null}
        {mine.dropoffAddress || mine.dropoffLat != null ? (
          <div className="place">
            <span className="small muted">{t('loc.dropoff')}</span>
            {mine.dropoffAddress ? <b>{mine.dropoffAddress}</b> : null}
            <MapLinks lat={mine.dropoffLat} lng={mine.dropoffLng} />
          </div>
        ) : null}
        {mine.contact ? <ContactBox contact={mine.contact} title={t('trip.contactTitle')} /> : <Alert>{t('trip.contactHidden')}</Alert>}
        {trip.status === 'SCHEDULED' ? (
          <Button variant="danger" block onClick={() => setConfirmCancel(true)}>
            {t('trip.cancelBooking')}
          </Button>
        ) : null}
      </div>
    );
  } else if (trip.status !== 'SCHEDULED' || new Date(trip.departureAt) < new Date()) {
    panel = <Alert kind="warning">{t('trip.notBookable')}</Alert>;
  } else if (trip.availableSeats === 0) {
    panel = <Alert kind="warning">{t('trip.full')}</Alert>;
  } else if (!user) {
    panel = (
      <Link to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} className="btn btn-primary btn-lg btn-block">
        {t('trip.loginToBook')}
      </Link>
    );
  } else {
    panel = (
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          book.mutate();
        }}
      >
        <span className={selected.length ? '' : 'muted'} style={{ fontWeight: selected.length ? 600 : 400 }}>
          {selected.length ? t('seat.chosen', { list: selected.join(', ') }) : t('seat.none')}
        </span>
        {trip.pickupFromHome ? (
          <PlaceField label={t('loc.pickup')} address={pickupAddress} onAddress={setPickupAddress} point={pickup} onPoint={setPickup} center={regionCenterCoords(cities, trip.from.id)} error={bookErr.pickupAddress ?? bookErr.pickupLat} />
        ) : null}
        <PlaceField label={`${t('loc.dropoff')} ${t('loc.optional')}`} address={dropoffAddress} onAddress={setDropoffAddress} point={dropoff} onPoint={setDropoff} center={regionCenterCoords(cities, trip.to.id)} error={bookErr.dropoffAddress ?? bookErr.dropoffLat} />
        <Textarea label={`${t('trip.comment')} (${t('common.optional')})`} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('trip.commentPh')} maxLength={500} rows={3} error={bookErr.comment} />
        <div className="row between">
          <span className="muted">{t('trip.total')}</span>
          <b className="head-num" style={{ fontSize: 22 }}>
            {money(total)} {t('common.som')}
          </b>
        </div>
        {book.isError && !Object.keys(bookErr).length ? <Alert kind="error">{errorText(book.error, t)}</Alert> : null}
        <Button size="lg" block type="submit" loading={book.isPending} disabled={!selected.length}>
          {t('trip.book')}
        </Button>
        <span className="small faint" style={{ textAlign: 'center' }}>
          {t('trip.contactHidden')}
        </span>
      </form>
    );
  }

  return (
    <div className="page" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,380px),1fr))', gap: 24, alignItems: 'start' }}>
      <div className="stack" style={{ gap: 20 }}>
        <div className="card card-lg stack">
          <div className="row between" style={{ flexWrap: 'wrap' }}>
            <span className="muted">{departure(trip.departureAt, lang, t)}</span>
            {trip.status !== 'SCHEDULED' ? <StatusBadge status={trip.status} /> : null}
          </div>
          <RouteLine from={cityName(trip.from, lang)} fromSub={`${t('trip.depart')} ${time(trip.departureAt)}`} to={cityName(trip.to, lang)} toSub={trip.to.region} />
          <div className="row-wrap">
            <span className={`badge ${trip.availableSeats > 0 ? 'badge-green' : 'badge-red'}`}>{t('common.free', { n: trip.availableSeats })}</span>
            {trip.pickupFromHome ? (
              <span className="badge badge-yellow">
                <IconHome size={13} /> {t('trip.pickupHome')}
              </span>
            ) : null}
            {trip.acceptsCargo ? (
              <span className="badge">
                <IconBox size={13} /> {t('trip.cargo')}
              </span>
            ) : null}
          </div>
          <hr className="divider" />
          <div className="row between">
            <span className="muted">{t('common.price')}</span>
            <span>
              <b className="head-num" style={{ fontSize: 26 }}>
                {range.varies ? t('seat.from', { price: money(range.min) }) : money(range.min)}
              </b>{' '}
              <span className="muted small">{t('common.perSeat')}</span>
            </span>
          </div>
        </div>

        <div className="card stack">
          <div className="row">
            <UserChip
              user={trip.driver}
              size={56}
              rating={{ avg: trip.driver.rating, count: trip.driver.ratingCount }}
              sub={
                <>
                  {trip.driver.tripsCount} {t('common.trips')} ·{' '}
                  <span className="badge badge-green" style={{ height: 22 }}>
                    {t('trip.verified')}
                  </span>
                </>
              }
            />
          </div>
          <div className="row" style={{ background: 'var(--bg-alt)', borderRadius: 14, padding: 12 }}>
            <IconCar />
            <div>
              <div style={{ fontWeight: 600 }}>
                {trip.vehicle.model}, {trip.vehicle.color.toLowerCase()}
              </div>
              <div className="small muted">
                {t('trip.plate')}: <span className="num">{plate}</span>
              </div>
            </div>
          </div>
          {trip.vehicle.photos.length ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 8 }}>
              {trip.vehicle.photos.map((src) => (
                <img key={src} src={src} alt="" className="thumb" loading="lazy" />
              ))}
            </div>
          ) : null}
          {trip.note ? (
            <div>
              <div className="field-label">{t('trip.note')}</div>
              <p style={{ margin: '4px 0 0' }}>{trip.note}</p>
            </div>
          ) : null}
        </div>

        <div className="stack">
          <h3 style={{ fontSize: 20 }}>{t('trip.reviews')}</h3>
          {trip.driverReviews.length ? (
            trip.driverReviews.map((r) => (
              <div key={r.id} className="card stack-sm">
                <div className="row between">
                  <b>{r.author.name}</b>
                  <span className="row" style={{ gap: 2 }}>
                    {Array.from({ length: r.rating }, (_, i) => (
                      <Star key={i} />
                    ))}
                  </span>
                </div>
                {r.text ? <p style={{ margin: 0 }}>{r.text}</p> : null}
                <span className="small faint">{relativeTime(r.createdAt, lang)}</span>
              </div>
            ))
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              {t('trip.noReviews')}
            </p>
          )}
        </div>
      </div>

      <div className="card card-lg stack" style={{ gap: 20 }}>
        {seatMap}
        <hr className="divider" />
        {panel}
      </div>

      <Modal open={confirmCancel} onClose={() => setConfirmCancel(false)} title={t('trip.cancelConfirm')}>
        <div className="stack">
          {late ? <Alert kind="warning">{t('trip.lateWarn')}</Alert> : null}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setConfirmCancel(false)}>
              {t('common.no')}
            </Button>
            <Button variant="danger" loading={cancel.isPending} onClick={() => mine && cancel.mutate(mine.id)}>
              {t('trip.cancelBooking')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
