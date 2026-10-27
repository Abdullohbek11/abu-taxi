import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SeatMap } from '../../components/SeatMap';
import { RegionSelect } from '../../components/RegionSelect';
import { IconBox, IconCar, IconCheck, IconPlus, IconTrash, IconUpload } from '../../components/Icons';
import { TripCard } from '../../components/TripCard';
import { Alert, Button, Checkbox, Empty, ErrorState, Input, Modal, Segmented, Select, Skeleton, StatusBadge, Tabs, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { errorText, fieldErrors } from '../../lib/errors';
import { addDays, dayLabel, money, tashkentDateKey, tashkentToIso, weekdayShort } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import type { BillingPlan, DriverDocument, DriverProfile, DriverStats, DriverTrip, Me, RideRequest, Vehicle } from '../../lib/types';
import type { MessageKey } from '../../locales/uz';
import { DriverRideRequests } from './DriverRideRequests';
import { PendingRequests } from './PendingRequests';
import { UserChip } from '../../components/ProfileSheet';

type Tab = 'trips' | 'requests' | 'account' | 'stats';

function useDriver() {
  return useQuery({ queryKey: ['driver', 'me'], queryFn: () => api.get<DriverProfile>('/drivers/me'), retry: false });
}

/* ───────── Ro'yxatdan o'tish ───────── */
function Register() {
  const { t } = useI18n();
  const { user, applySession } = useAuth();
  const qc = useQueryClient();
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const reg = useMutation({
    mutationFn: () => api.post<{ user: Me; accessToken: string }>('/drivers/register', { firstName: firstName.trim(), lastName: lastName.trim() }),
    onSuccess: (res) => {
      applySession({ accessToken: res.accessToken, user: res.user });
      void qc.invalidateQueries({ queryKey: ['driver'] });
    },
  });
  const fe = fieldErrors(reg.error);
  return (
    <form
      className="card card-lg stack"
      onSubmit={(e) => {
        e.preventDefault();
        reg.mutate();
      }}
    >
      <span className="icon-tile" style={{ width: 56, height: 56 }}>
        <IconCar size={26} />
      </span>
      <h2 style={{ fontSize: 24 }}>{t('drv.registerTitle')}</h2>
      <p className="muted" style={{ margin: 0 }}>
        {t('drv.registerLead')}
      </p>
      <div className="grid-2">
        <Input label={t('onb.firstName')} value={firstName} onChange={(e) => setFirstName(e.target.value)} required minLength={2} error={fe.firstName} />
        <Input label={t('onb.lastName')} value={lastName} onChange={(e) => setLastName(e.target.value)} required minLength={2} error={fe.lastName} />
      </div>
      {reg.isError && !Object.keys(fe).length ? <Alert kind="error">{errorText(reg.error, t)}</Alert> : null}
      <Button size="lg" type="submit" loading={reg.isPending} style={{ alignSelf: 'flex-start' }}>
        {t('drv.registerBtn')}
      </Button>
    </form>
  );
}

/* ───────── Holat banneri ───────── */
function StatusBanner({ p }: { p: DriverProfile }) {
  const { t } = useI18n();
  // Tasdiqlangan haydovchi uchun holat bosh paneldagi belgi bilan ko'rsatiladi
  if (p.status === 'APPROVED') return null;
  const docs = new Set(p.documents.map((d) => d.type));
  if (p.status === 'PENDING' && (!docs.has('LICENSE') || !docs.has('TECH_PASSPORT') || !p.vehicles.length)) {
    return (
      <Alert kind="info">
        <span>
          <b>{t('drv.setupTitle')}</b>
          <br />
          {t('drv.setupD')}
        </span>
      </Alert>
    );
  }
  if (p.status === 'REJECTED')
    return (
      <Alert kind="error">
        <span>
          <b>{t('drv.rejected')}</b>
          <br />
          {t('drv.rejectedD', { reason: p.rejectReason ?? '—' })}
        </span>
      </Alert>
    );
  return (
    <Alert kind="warning">
      <span>
        <b>{t('drv.pending')}</b>
        <br />
        {t('drv.pendingD')}
      </span>
    </Alert>
  );
}

/* ───────── Hujjatlar ───────── */
function DocUpload({ type, doc }: { type: DriverDocument['type']; doc?: DriverDocument }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const ref = useRef<HTMLInputElement>(null);
  // Fayl topilmasa (masalan, muddati o'tgan havola) — buzuq rasm o'rniga ikonka
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [doc?.url]);
  const up = useMutation({
    mutationFn: (file: File) => {
      const f = new FormData();
      f.append('type', type);
      f.append('file', file);
      return api.upload('/drivers/me/documents', f);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['driver'] }),
    onError: (err) => toast(errorText(err, t), 'error'),
  });
  return (
    <div className="upload-box" onClick={() => !up.isPending && ref.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && ref.current?.click()}>
      {doc?.url && !broken ? <img src={doc.url} alt="" onError={() => setBroken(true)} style={{ width: 72, height: 54, objectFit: 'cover', borderRadius: 8 }} /> : <span className="icon-tile"><IconUpload /></span>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <b>{t(`drv.doc${type}` as MessageKey)}</b>
        <div className="small faint">{t('drv.uploadHint')}</div>
      </div>
      {up.isPending ? <span className="spinner" /> : doc ? <StatusBadge status={doc.status} /> : <span className="btn btn-ghost btn-sm">{t('drv.upload')}</span>}
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => e.target.files?.[0] && up.mutate(e.target.files[0])} />
    </div>
  );
}

/* ───────── Mashinalar ───────── */
function VehicleForm({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [v, setV] = useState({ model: '', color: '', plateNumber: '', seats: 4, acceptsCargo: false });
  const add = useMutation({
    mutationFn: () => api.post<Vehicle>('/vehicles', v),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['driver'] });
      onDone();
    },
  });
  const fe = fieldErrors(add.error);
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate();
      }}
    >
      <div className="grid-2">
        <Input label={t('drv.model')} placeholder={t('drv.modelPh')} value={v.model} onChange={(e) => setV({ ...v, model: e.target.value })} required minLength={2} error={fe.model} />
        <Input label={t('drv.color')} placeholder={t('drv.colorPh')} value={v.color} onChange={(e) => setV({ ...v, color: e.target.value })} required minLength={2} error={fe.color} />
        <Input label={t('drv.plate')} placeholder={t('drv.platePh')} value={v.plateNumber} onChange={(e) => setV({ ...v, plateNumber: e.target.value.toUpperCase() })} required error={fe.plateNumber} />
        <Select label={t('drv.vehicleSeats')} value={v.seats} onChange={(e) => setV({ ...v, seats: Number(e.target.value) })}>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Select>
      </div>
      <Checkbox label={t('drv.acceptsCargo')} checked={v.acceptsCargo} onChange={(c) => setV({ ...v, acceptsCargo: c })} />
      {add.isError && !Object.keys(fe).length ? <Alert kind="error">{errorText(add.error, t)}</Alert> : null}
      <Button type="submit" loading={add.isPending}>
        {t('common.save')}
      </Button>
    </form>
  );
}

function VehicleCard({ v }: { v: Vehicle }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const ref = useRef<HTMLInputElement>(null);
  const addPhotos = useMutation({
    mutationFn: (files: FileList) => {
      const f = new FormData();
      [...files].forEach((file) => f.append('photos', file));
      return api.upload(`/vehicles/${v.id}/photos`, f);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['driver'] }),
    onError: (err) => toast(errorText(err, t), 'error'),
  });
  const delPhoto = useMutation({
    mutationFn: (i: number) => api.del(`/vehicles/${v.id}/photos/${i}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['driver'] }),
  });
  return (
    <div className="card stack-sm">
      <div className="row between">
        <div className="row">
          <span className="icon-tile">
            <IconCar />
          </span>
          <div>
            <b>
              {v.model}, {v.color.toLowerCase()}
            </b>
            <div className="small muted num">
              {v.plateNumber} · {t('common.seats', { n: v.seats })}
              {v.acceptsCargo ? ` · ${t('trip.cargo')}` : ''}
            </div>
          </div>
        </div>
        <StatusBadge status={v.status} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(96px,1fr))', gap: 8 }}>
        {v.photos.map((src, i) => (
          <div key={src} style={{ position: 'relative' }}>
            <img src={src} alt="" className="thumb" />
            <button className="icon-btn" style={{ position: 'absolute', top: 4, right: 4, width: 28, height: 28 }} onClick={() => delPhoto.mutate(i)} aria-label="×">
              <IconTrash size={14} />
            </button>
          </div>
        ))}
        {v.photos.length < 6 ? (
          <button className="upload-box" style={{ aspectRatio: '4/3', justifyContent: 'center', padding: 0 }} onClick={() => ref.current?.click()} aria-label={t('drv.addPhotos')}>
            {addPhotos.isPending ? <span className="spinner" /> : <IconPlus />}
          </button>
        ) : null}
        <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => e.target.files?.length && addPhotos.mutate(e.target.files)} />
      </div>
    </div>
  );
}

function Account({ p }: { p: DriverProfile }) {
  const { t } = useI18n();
  const [adding, setAdding] = useState(false);
  const docOf = (type: DriverDocument['type']) => p.documents.find((d) => d.type === type);
  return (
    <div className="stack" style={{ gap: 24 }}>
      <section className="stack">
        <h3 style={{ fontSize: 20 }}>{t('drv.docs')}</h3>
        <DocUpload type="LICENSE" doc={docOf('LICENSE')} />
        <DocUpload type="TECH_PASSPORT" doc={docOf('TECH_PASSPORT')} />
      </section>
      <section className="stack">
        <div className="row between">
          <h3 style={{ fontSize: 20 }}>{t('drv.vehicles')}</h3>
          <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
            <IconPlus /> {t('drv.addVehicle')}
          </Button>
        </div>
        {p.vehicles.length ? p.vehicles.map((v) => <VehicleCard key={v.id} v={v} />) : <Empty icon={<IconCar size={26} />} title={t('drv.noVehicles')} action={<Button onClick={() => setAdding(true)}>{t('drv.addVehicle')}</Button>} />}
      </section>
      <Modal open={adding} onClose={() => setAdding(false)} title={t('drv.addVehicle')}>
        <VehicleForm onDone={() => setAdding(false)} />
      </Modal>
    </div>
  );
}

/* ───────── Safar e'lon qilish ───────── */
function NewTripForm({ p, onDone }: { p: DriverProfile; onDone: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const approved = p.vehicles.filter((v) => v.status === 'APPROVED');
  const [f, setF] = useState(() => ({
    vehicleId: approved[0]?.id ?? '',
    fromCityId: '',
    toCityId: '',
    date: addDays(tashkentDateKey(), 1),
    time: '06:00',
    totalSeats: approved[0]?.seats ?? 4,
    pricePerSeat: '150000',
    pickupFromHome: true,
    acceptsCargo: approved[0]?.acceptsCargo ?? false,
    note: '',
  }));
  const vehicle = approved.find((v) => v.id === f.vehicleId);
  // Har bir o'rin narxi; umumiy narx o'zgarsa, unga teng bo'lgan o'rinlar ham yangilanadi
  const [prices, setPrices] = useState<string[]>(() => Array.from({ length: f.totalSeats }, () => f.pricePerSeat));
  const resizePrices = (n: number) => setPrices((ps) => Array.from({ length: n }, (_, i) => ps[i] ?? f.pricePerSeat));
  const setBasePrice = (v: string) => {
    setPrices((ps) => ps.map((x) => (x === f.pricePerSeat ? v : x)));
    setF({ ...f, pricePerSeat: v });
  };
  const pricesValid = prices.length === f.totalSeats && prices.every((x) => Number(x) >= 10_000);

  const create = useMutation({
    mutationFn: () =>
      api.post('/trips', {
        vehicleId: f.vehicleId,
        fromCityId: f.fromCityId,
        toCityId: f.toCityId,
        departureAt: tashkentToIso(f.date, f.time),
        totalSeats: f.totalSeats,
        seatPrices: prices.map(Number),
        pickupFromHome: f.pickupFromHome,
        acceptsCargo: f.acceptsCargo,
        ...(f.note.trim() ? { note: f.note.trim() } : {}),
      }),
    onSuccess: () => {
      toast(t('drv.published'));
      void qc.invalidateQueries({ queryKey: ['driver'] });
      onDone();
    },
  });
  const fe = fieldErrors(create.error);

  if (!approved.length) return <Alert kind="warning">{t('drv.needVehicle')}</Alert>;
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <Select label={t('drv.vehicle')} value={f.vehicleId} onChange={(e) => {
        const v = approved.find((x) => x.id === e.target.value);
        setF({ ...f, vehicleId: e.target.value, totalSeats: v?.seats ?? f.totalSeats, acceptsCargo: v?.acceptsCargo ?? false });
        resizePrices(v?.seats ?? f.totalSeats);
      }}>
        {approved.map((v) => (
          <option key={v.id} value={v.id}>
            {v.model} · {v.plateNumber}
          </option>
        ))}
      </Select>
      <div className="grid-2">
        <RegionSelect label={t('common.from')} value={f.fromCityId} onChange={(id) => setF({ ...f, fromCityId: id })} error={fe.fromCityId} />
        <RegionSelect label={t('common.to')} value={f.toCityId} onChange={(id) => setF({ ...f, toCityId: id })} error={fe.toCityId} />
        <Input label={t('drv.departDate')} type="date" value={f.date} min={tashkentDateKey()} max={addDays(tashkentDateKey(), 30)} onChange={(e) => setF({ ...f, date: e.target.value })} required />
        <Input label={t('drv.departTime')} type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} required error={fe.departureAt} />
        <Select
          label={t('drv.totalSeats')}
          value={f.totalSeats}
          onChange={(e) => {
            setF({ ...f, totalSeats: Number(e.target.value) });
            resizePrices(Number(e.target.value));
          }}
        >
          {Array.from({ length: vehicle?.seats ?? 4 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Select>
        <Input label={t('drv.pricePerSeat')} inputMode="numeric" value={f.pricePerSeat} onChange={(e) => setBasePrice(e.target.value.replace(/\D/g, '').slice(0, 7))} required hint={f.pricePerSeat ? `${money(Number(f.pricePerSeat))} ${t('common.som')}` : undefined} error={fe.pricePerSeat} />
      </div>
      <div className="stack-sm">
        <div className="row between" style={{ flexWrap: 'wrap' }}>
          <span className="field-label">{t('seat.pricesTitle')}</span>
          <Button type="button" size="sm" variant="ghost" onClick={() => setPrices(prices.map(() => f.pricePerSeat))} disabled={prices.every((x) => x === f.pricePerSeat)}>
            {t('seat.samePrice')}
          </Button>
        </div>
        <span className="small muted">{t('seat.pricesHint')}</span>
        <SeatMap total={f.totalSeats} prices={prices.map(Number)} editPrices={prices} onPriceChange={(i, v) => setPrices(prices.map((x, j) => (j === i ? v : x)))} />
        {!pricesValid ? <span className="field-error">{t('seat.pricesMissing')}</span> : fe.seatPrices ? <span className="field-error">{fe.seatPrices}</span> : null}
      </div>
      <div className="row-wrap" style={{ gap: 20 }}>
        <Checkbox label={t('trip.pickupHome')} checked={f.pickupFromHome} onChange={(c) => setF({ ...f, pickupFromHome: c })} />
        {vehicle?.acceptsCargo ? <Checkbox label={t('drv.acceptsCargo')} checked={f.acceptsCargo} onChange={(c) => setF({ ...f, acceptsCargo: c })} /> : null}
      </div>
      <Textarea label={`${t('drv.tripNote')} (${t('common.optional')})`} placeholder={t('drv.tripNotePh')} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={500} rows={2} />
      {create.isError && !Object.keys(fe).length ? <Alert kind="error">{errorText(create.error, t)}</Alert> : null}
      <Button size="lg" type="submit" loading={create.isPending} disabled={!pricesValid}>
        {t('drv.publish')}
      </Button>
    </form>
  );
}

function Trips({ p }: { p: DriverProfile }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<'active' | 'completed' | 'cancelled'>('active');
  const [creating, setCreating] = useState(false);
  const q = useQuery({ queryKey: ['driver', 'trips', status], queryFn: () => api.page<DriverTrip>('/trips/my', { status, limit: 50 }) });
  return (
    <div className="stack">
      <div className="row-wrap between">
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { value: 'active', label: t('drv.active') },
            { value: 'completed', label: t('drv.completed') },
            { value: 'cancelled', label: t('drv.cancelled') },
          ]}
        />
        <Button onClick={() => setCreating(true)} disabled={p.status !== 'APPROVED'}>
          <IconPlus /> {t('drv.newTrip')}
        </Button>
      </div>
      {p.status !== 'APPROVED' ? <Alert kind="warning">{t('drv.needApproval')}</Alert> : null}
      {q.isPending ? (
        <Skeleton height={120} />
      ) : q.isError ? (
        <ErrorState message={errorText(q.error, t)} onRetry={() => q.refetch()} />
      ) : !q.data.items.length ? (
        <Empty icon={<IconCar size={26} />} title={t('drv.noTrips')} />
      ) : (
        // Tasdiqlanmagan so'rovi bor safarlar tepada
        [...q.data.items].sort((a, b) => Number(b.pendingBookings > 0) - Number(a.pendingBookings > 0)).map((trip, i) => (
          <TripCard
            key={trip.id}
            trip={trip}
            to={`/driver/trips/${trip.id}`}
            showStatus
            delay={i * 40}
            extra={
              <>
                <span className="badge">{t('drv.booked', { booked: trip.totalSeats - trip.availableSeats, total: trip.totalSeats })}</span>
                {trip.pendingBookings ? <span className="badge badge-orange">{t('drv.pendingRequests', { n: trip.pendingBookings })}</span> : null}
              </>
            }
          />
        ))
      )}
      <Modal open={creating} onClose={() => setCreating(false)} title={t('drv.newTrip')}>
        <NewTripForm p={p} onDone={() => setCreating(false)} />
      </Modal>
    </div>
  );
}

/* ───────── Bosh panel: bir qarashda reyting, daromad, faol safarlar va kutayotgan yo'lovchilar ───────── */
function DriverSummary({ p, onTab }: { p: DriverProfile; onTab: (v: Tab) => void }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const approved = p.status === 'APPROVED';
  const stats = useQuery({ queryKey: ['driver', 'stats'], queryFn: () => api.get<DriverStats>('/drivers/me/stats'), enabled: approved });
  const open = useQuery({
    queryKey: ['rideRequests', 'open', 'count'],
    queryFn: () => api.page<RideRequest>('/ride-requests/open', { limit: 50 }),
    enabled: approved,
    refetchInterval: 60_000,
  });
  if (!user) return null;
  const plan = useQuery({ queryKey: ['billing', 'plan'], queryFn: () => api.get<BillingPlan>('/billing/plan'), enabled: approved });
  const s = stats.data;
  const openCount = open.data?.items.length ?? 0;
  const bill = plan.data;
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || '•';
  return (
    <div className="card dash-hero">
      <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <UserChip user={{ id: user.id, name, avatarUrl: user.avatarUrl }} rating={{ avg: p.ratingAvg, count: p.ratingCount }} size={48} sub={t('drv.myProfileHint')} />
        {approved ? (
          <span className="badge badge-green">
            <IconCheck size={12} /> {t('drv.approved')}
          </span>
        ) : null}
      </div>
      {approved && bill?.enabled ? (
        <Link to="/driver/tariff" className={`tariff-chip ${bill.subscription.active ? 'ok' : 'off'}`}>
          {bill.subscription.active
            ? t('bill.chipActive', { date: dayLabel(tashkentDateKey(new Date(bill.subscription.until!)), lang, t) })
            : t('bill.chipInactive')}
          <span>›</span>
        </Link>
      ) : null}
      {approved ? (
        <>
          <div className="stat-strip">
            <div>
              <b className="num">{s ? money(s.weeklyTotal) : '…'}</b>
              <span>{t('drv.week7')}</span>
            </div>
            <button type="button" onClick={() => onTab('trips')}>
              <b className="num">{s ? s.trips.scheduled + s.trips.inProgress : '…'}</b>
              <span>{t('drv.activeTrips')}</span>
            </button>
            <button type="button" onClick={() => onTab('requests')} className={openCount ? 'hot' : ''}>
              <b className="num">{openCount}</b>
              <span>{t('drv.waitingPassengers')}</span>
            </button>
          </div>
          <div className="quick-actions">
            <Button size="sm" variant="ghost" onClick={() => onTab('requests')}>
              🙋 {t('nav.short.requests')}
              {openCount ? <span className="badge badge-yellow">{openCount}</span> : null}
            </Button>
            <Link to="/driver/cargo" className="btn btn-ghost btn-sm">
              <IconBox size={16} /> {t('nav.short.cargoOpen')}
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ───────── Statistika ───────── */
function Stats() {
  const { t, lang } = useI18n();
  const q = useQuery({ queryKey: ['driver', 'stats'], queryFn: () => api.get<DriverStats>('/drivers/me/stats') });
  if (q.isPending) return <Skeleton height={160} count={2} />;
  if (q.isError) return <ErrorState message={errorText(q.error, t)} onRetry={() => q.refetch()} />;
  const s = q.data;
  const max = Math.max(...s.weeklyEarnings.map((d) => d.total), 1);
  const dayName = (d: string) => weekdayShort(d, lang);
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="stat-strip">
        <div>
          <b className="num">{s.trips.completed}</b>
          <span>{t('drv.tripsDone')}</span>
        </div>
        <div>
          <b className="num">{s.trips.cancelled}</b>
          <span>{t('status.CANCELLED')}</span>
        </div>
        <div>
          <b className="num">{s.trips.total}</b>
          <span>{t('prof.trips')}</span>
        </div>
      </div>
      <div className="card stack">
        <b>{t('drv.weekly')}</b>
        <div className="bars">
          {s.weeklyEarnings.map((d) => (
            <div className="bar" key={d.date} title={`${money(d.total)} ${t('common.som')}`}>
              <span className="small num faint" style={{ fontSize: 11 }}>{d.total ? money(Math.round(d.total / 1000)) + 'k' : ''}</span>
              <div className={`bar-fill ${d.total ? '' : 'zero'}`} style={{ height: `${Math.max(4, (d.total / max) * 120)}px` }} />
              <span className="small muted">{dayName(d.date)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="card stack">
        <b>{t('drv.today')}</b>
        {s.today.trips.length ? s.today.trips.map((trip) => <TripCard key={trip.id} trip={trip} to={`/driver/trips/${trip.id}`} showStatus extra={<span className="badge">{t('drv.booked', { booked: trip.bookedSeats, total: trip.totalSeats })}</span>} />) : <span className="muted">{t('drv.noToday')}</span>}
      </div>
    </div>
  );
}

export default function DriverHome() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const q = useDriver();
  const tab = (params.get('tab') as Tab) || 'trips';
  const setTab = (v: Tab) => setParams({ tab: v }, { replace: true });

  if (user?.role !== 'DRIVER') {
    return (
      <div className="page page-narrow">
        <Register />
      </div>
    );
  }
  if (q.isPending) return <div className="page"><Skeleton height={120} /></div>;
  if (q.isError) return <div className="page page-narrow"><ErrorState message={errorText(q.error, t)} onRetry={() => q.refetch()} /></div>;
  const p = q.data;
  const needsAccount = p.status !== 'APPROVED' && tab === 'trips' && !params.get('tab');

  return (
    <div className="page stack" style={{ gap: 20 }}>
      <h1 className="page-title">{t('drv.title')}</h1>
      <DriverSummary p={p} onTab={setTab} />
      <StatusBanner p={p} />
      <PendingRequests />
      <Tabs
        value={needsAccount ? 'account' : tab}
        onChange={setTab}
        options={[
          { value: 'trips', label: t('drv.tabTrips') },
          { value: 'requests', label: t('rr.tabDriver') },
          { value: 'account', label: t('drv.tabStatus') },
          { value: 'stats', label: t('drv.tabStats') },
        ]}
      />
      {needsAccount || tab === 'account' ? <Account p={p} /> : tab === 'stats' ? <Stats /> : tab === 'requests' ? <DriverRideRequests p={p} /> : <Trips p={p} />}
    </div>
  );
}
