import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { IconUpload } from '../../components/Icons';
import { Alert, Avatar, Button, ConfirmDialog, Empty, ErrorState, Input, Modal, Select, Skeleton, StatusBadge } from '../../components/ui';
import { api, download } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { errorText } from '../../lib/errors';
import { money, phoneDisplay, relativeTime } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import type { Me } from '../../lib/types';
import { GrantSubscription } from './AdminBilling';
import type { MessageKey } from '../../locales/uz';

/* ───────── Turlar (backend: admin.data.service) ───────── */
interface Brief {
  id: string;
  phone: string | null;
  name: string;
  telegramUsername: string | null;
  isBlocked: boolean;
  role: string | null;
}
interface CityName {
  nameUz: string;
  nameRu: string;
  region: string;
}
interface Overview {
  users: { byRole: Record<string, number>; blocked: number; newLast7Days: number };
  drivers: Record<string, number>;
  trips: Record<string, number>;
  bookings: { byStatus: Record<string, number>; last24h: number; lateCancellations30d: number };
  cargo: Record<string, number>;
  rideRequests: Record<string, number>;
  reviews: { count: number; avg: number };
  volume30d: { passengers: number; cargo: number };
  admins: number;
  daily: Record<'users' | 'bookings' | 'rideRequests' | 'trips', { date: string; count: number }[]>;
  topRoutes: { from: string; to: string; trips: number }[];
  topDrivers: { id: string; user: Brief; rating: number; ratingCount: number; tripsCount: number }[];
  billing: { enabled: boolean; activeSubscriptions: number; pendingPayments: number; revenue30d: number; revenueTotal: number };
}
interface UserDetail {
  user: Me & { blockReason?: string | null; hasPassword: boolean; clientRating: { avg: number; count: number }; activeSessions: number };
  driver: {
    status: string;
    rejectReason: string | null;
    rating: number;
    ratingCount: number;
    tripsCount: number;
    subscriptionUntil: string | null;
    vehicles: { id: string; model: string; color: string; plateNumber: string; seats: number; status: string }[];
    documents: { id: string; type: string; status: string }[];
  } | null;
  counts: { bookings: number; trips: number; cargo: number; rideRequests: number; lateCancellations: number };
  bookings: { id: string; status: string; seats: number; totalPrice: number; route: string; departureAt: string; cancelledLate: boolean }[];
  trips: { id: string; status: string; route: string; departureAt: string; totalSeats: number; availableSeats: number; pricePerSeat: number }[];
  cargo: { id: string; status: string; type: string; weightKg: number; route: string; date: string; offeredPrice: number | null }[];
  rideRequests: { id: string; status: string; route: string; date: string; seats: number; pricePerSeat: number | null; asDriver: boolean }[];
  reviewsReceived: { id: string; rating: number; text: string | null; role: string; createdAt: string; author: Brief }[];
  reviewsWritten: { id: string; rating: number; text: string | null; role: string; createdAt: string; target: Brief }[];
  audit: { id: string; action: string; ip: string | null; createdAt: string; admin: string }[];
}

const sum = (o: Record<string, number> | undefined) => Object.values(o ?? {}).reduce((s, n) => s + n, 0);
const dt = (iso: string) => new Date(iso).toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const day = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric' });

/* ───────── Kichik grafik: 30 kunlik ustunlar ───────── */
function MiniBars({ title, rows }: { title: string; rows: { date: string; count: number }[] }) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  const total = rows.reduce((s, r) => s + r.count, 0);
  const today = rows.at(-1)?.count ?? 0;
  const w = 300;
  const bw = w / rows.length;
  return (
    <div className="card stack-sm">
      <div className="row between">
        <b>{title}</b>
        <span className="small muted">
          30 kun: <b className="num">{total}</b> · bugun: <b className="num">{today}</b>
        </span>
      </div>
      <svg viewBox={`0 0 ${w} 64`} className="minibars" role="img" aria-label={`${title}: ${total}`}>
        {rows.map((r, i) => (
          <rect key={r.date} x={i * bw + 1} y={60 - (r.count / max) * 56} width={bw - 2} height={Math.max((r.count / max) * 56, r.count ? 2 : 1)} rx="1.5" className={i === rows.length - 1 ? 'today' : ''}>
            <title>{`${r.date}: ${r.count}`}</title>
          </rect>
        ))}
      </svg>
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'warn' | 'ok' }) {
  return (
    <div className={`kpi ${tone ?? ''}`}>
      <span className="small muted">{label}</span>
      <b className="num">{value}</b>
      {sub ? <span className="small muted">{sub}</span> : null}
    </div>
  );
}

/* ───────── Umumiy ko'rinish ───────── */
export function AdminOverview({ go }: { go: (section: string) => void }) {
  const { t } = useI18n();
  const q = useQuery({ queryKey: ['admin', 'overview'], queryFn: () => api.get<Overview>('/admin/overview'), refetchInterval: 60_000 });
  if (q.isPending) return <Skeleton height={110} count={4} />;
  if (q.isError) return <ErrorState message={errorText(q.error, t)} onRetry={() => q.refetch()} />;
  const o = q.data;
  const users = sum(o.users.byRole);
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="kpi-grid">
        <Kpi label={t('adm.kUsers')} value={users} sub={`+${o.users.newLast7Days} ${t('adm.k7days')} · ${o.users.blocked} ${t('adm.kBlocked')}`} />
        <Kpi label={t('adm.kDrivers')} value={o.drivers.APPROVED ?? 0} sub={`${o.drivers.PENDING ?? 0} ${t('adm.kWaiting')}`} tone={o.drivers.PENDING ? 'warn' : undefined} />
        <Kpi label={t('adm.kTrips')} value={sum(o.trips)} sub={`${o.trips.SCHEDULED ?? 0} ${t('adm.kScheduled')} · ${o.trips.COMPLETED ?? 0} ${t('adm.kDone')}`} />
        <Kpi label={t('adm.kBookings')} value={sum(o.bookings.byStatus)} sub={`${o.bookings.last24h} ${t('adm.k24h')} · ${o.bookings.lateCancellations30d} ${t('adm.kLate')}`} />
        <Kpi label={t('adm.kRequests')} value={sum(o.rideRequests)} sub={`${o.rideRequests.OPEN ?? 0} ${t('adm.kOpen')} · ${o.rideRequests.ASSIGNED ?? 0} ${t('adm.kFound')}`} tone={o.rideRequests.OPEN ? 'warn' : undefined} />
        <Kpi label={t('adm.kCargo')} value={sum(o.cargo)} sub={`${o.cargo.OPEN ?? 0} ${t('adm.kOpen')} · ${o.cargo.DELIVERED ?? 0} ${t('adm.kDelivered')}`} />
        <Kpi label={t('adm.kReviews')} value={o.reviews.count} sub={o.reviews.count ? `★ ${o.reviews.avg.toFixed(2)}` : '—'} />
        <Kpi
          label={t('bill.kRevenue')}
          value={money(o.billing.revenue30d)}
          sub={o.billing.enabled ? `${o.billing.activeSubscriptions} ${t('bill.kActive')} · ${o.billing.pendingPayments} ${t('bill.kPending')}` : t('bill.kOff')}
          tone={o.billing.pendingPayments ? 'warn' : 'ok'}
        />
        <Kpi label={t('adm.kVolume')} value={money(o.volume30d.passengers + o.volume30d.cargo)} sub={`${t('common.som')} · ${t('adm.kVolumeSub')}`} tone="ok" />
      </div>

      {o.drivers.PENDING || o.rideRequests.OPEN || o.billing.pendingPayments ? (
        <div className="row-wrap" style={{ gap: 8 }}>
          {o.billing.pendingPayments ? (
            <Button size="sm" onClick={() => go('payments')}>
              {t('bill.todoPayments', { n: o.billing.pendingPayments })}
            </Button>
          ) : null}
          {o.drivers.PENDING ? (
            <Button size="sm" onClick={() => go('drivers')}>
              {t('adm.todoDrivers', { n: o.drivers.PENDING })}
            </Button>
          ) : null}
          {o.rideRequests.OPEN ? (
            <Button size="sm" variant="ghost" onClick={() => go('requests')}>
              {t('adm.todoRequests', { n: o.rideRequests.OPEN })}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="grid-2">
        <MiniBars title={t('adm.chartUsers')} rows={o.daily.users} />
        <MiniBars title={t('adm.chartBookings')} rows={o.daily.bookings} />
        <MiniBars title={t('adm.chartRequests')} rows={o.daily.rideRequests} />
        <MiniBars title={t('adm.chartTrips')} rows={o.daily.trips} />
      </div>

      <div className="grid-2">
        <div className="card stack-sm">
          <b>{t('adm.topRoutes')}</b>
          {o.topRoutes.length ? (
            o.topRoutes.map((r) => (
              <div key={`${r.from}-${r.to}`} className="row between small" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span>
                  {r.from} → {r.to}
                </span>
                <b className="num">{r.trips}</b>
              </div>
            ))
          ) : (
            <span className="muted small">—</span>
          )}
        </div>
        <div className="card stack-sm">
          <b>{t('adm.topDrivers')}</b>
          {o.topDrivers.map((d) => (
            <div key={d.id} className="row between small" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <span>
                {d.user.name} <span className="muted">{phoneDisplay(d.user.phone)}</span>
              </span>
              <span>
                ★ {d.rating.toFixed(1)} <span className="muted">({d.ratingCount}) · {d.tripsCount}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ───────── Foydalanuvchining to'liq kartasi ───────── */
function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <details className="adm-section" open={!!count && count <= 5}>
      <summary>
        {title} {count !== undefined ? <span className="badge">{count}</span> : null}
      </summary>
      <div className="stack-sm" style={{ marginTop: 10 }}>
        {children}
      </div>
    </details>
  );
}

function Line({ left, right, status }: { left: ReactNode; right?: ReactNode; status?: string }) {
  return (
    <div className="adm-line">
      <span style={{ flex: 1, minWidth: 0 }}>{left}</span>
      {right ? <span className="small muted">{right}</span> : null}
      {status ? <StatusBadge status={status} /> : null}
    </div>
  );
}

export function UserDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [blocking, setBlocking] = useState(false);
  const q = useQuery({ queryKey: ['admin', 'user', id], queryFn: () => api.get<UserDetail>(`/admin/users/${id}`) });
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api.post(path, body),
    onSuccess: () => {
      setBlocking(false);
      toast(t('adm.saved'));
      void qc.invalidateQueries({ queryKey: ['admin'] });
    },
  });
  const d = q.data;
  const u = d?.user;
  const name = u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || '—' : '';
  return (
    <Modal open onClose={onClose} title={t('adm.userCard')}>
      {q.isPending ? (
        <Skeleton height={80} count={3} />
      ) : q.isError || !d || !u ? (
        <ErrorState message={errorText(q.error, t)} onRetry={() => q.refetch()} />
      ) : (
        <div className="stack">
          <div className="row" style={{ gap: 14 }}>
            <Avatar name={name} url={u.avatarUrl} size={56} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <b style={{ fontSize: 18 }}>{name}</b>
              <div className="small muted">
                {phoneDisplay(u.phone)} {u.telegramUsername ? `· @${u.telegramUsername}` : ''}
              </div>
              <div className="row-wrap" style={{ gap: 6, marginTop: 6 }}>
                <span className="badge">{u.role ?? '—'}</span>
                {u.isBlocked ? <span className="badge badge-red">{t('adm.blocked')}</span> : null}
                {u.hasPassword ? <span className="badge">🔐 {t('adm.hasPassword')}</span> : null}
                <span className="badge">{t('adm.sessions', { n: u.activeSessions })}</span>
              </div>
            </div>
          </div>
          {u.isBlocked && u.blockReason ? <Alert kind="error">{u.blockReason}</Alert> : null}

          <div className="kpi-grid small-kpi">
            <Kpi label={t('adm.kBookings')} value={d.counts.bookings} />
            <Kpi label={t('adm.kTrips')} value={d.counts.trips} />
            <Kpi label={t('adm.kRequests')} value={d.counts.rideRequests} />
            <Kpi label={t('adm.kCargo')} value={d.counts.cargo} />
            <Kpi label={t('adm.clientRating')} value={u.clientRating.count ? `★ ${u.clientRating.avg.toFixed(1)}` : '—'} sub={`${u.clientRating.count}`} />
            <Kpi label={t('adm.kLate')} value={d.counts.lateCancellations} tone={d.counts.lateCancellations ? 'warn' : undefined} />
          </div>
          <span className="small muted">
            {t('adm.registered')}: {dt(u.createdAt)} · ID: <code>{u.id}</code>
          </span>

          {d.driver ? (
            <Section title={t('adm.driverProfile')} count={d.driver.vehicles.length + d.driver.documents.length}>
              <Line left={`★ ${d.driver.rating.toFixed(1)} (${d.driver.ratingCount}) · ${d.driver.tripsCount} ${t('prof.trips')}`} status={d.driver.status} />
              <GrantSubscription userId={u.id} until={d.driver.subscriptionUntil} />
              {d.driver.rejectReason ? <Alert kind="warning">{d.driver.rejectReason}</Alert> : null}
              {d.driver.vehicles.map((v) => (
                <Line key={v.id} left={`🚗 ${v.model}, ${v.color} · ${v.plateNumber}`} right={t('common.people', { n: v.seats })} status={v.status} />
              ))}
              {d.driver.documents.map((doc) => (
                <Line key={doc.id} left={`📄 ${doc.type}`} status={doc.status} />
              ))}
            </Section>
          ) : null}
          <Section title={t('adm.secBookings')} count={d.bookings.length}>
            {d.bookings.map((b) => (
              <Line key={b.id} left={`${b.route} · ${dt(b.departureAt)}`} right={`${b.seats} · ${money(b.totalPrice)}${b.cancelledLate ? ' · ⚠️' : ''}`} status={b.status} />
            ))}
          </Section>
          {d.trips.length ? (
            <Section title={t('adm.secTrips')} count={d.trips.length}>
              {d.trips.map((tr) => (
                <Line key={tr.id} left={`${tr.route} · ${dt(tr.departureAt)}`} right={`${tr.totalSeats - tr.availableSeats}/${tr.totalSeats} · ${money(tr.pricePerSeat)}`} status={tr.status} />
              ))}
            </Section>
          ) : null}
          <Section title={t('adm.secRequests')} count={d.rideRequests.length}>
            {d.rideRequests.map((r) => (
              <Line key={r.id} left={`${r.asDriver ? '🚗 ' : ''}${r.route} · ${day(r.date)}`} right={`${r.seats}${r.pricePerSeat ? ` · ${money(r.pricePerSeat)}` : ''}`} status={r.status} />
            ))}
          </Section>
          <Section title={t('adm.secCargo')} count={d.cargo.length}>
            {d.cargo.map((c) => (
              <Line key={c.id} left={`${c.route} · ${day(c.date)}`} right={`${c.weightKg} kg${c.offeredPrice ? ` · ${money(c.offeredPrice)}` : ''}`} status={c.status} />
            ))}
          </Section>
          <Section title={t('adm.secReviewsIn')} count={d.reviewsReceived.length}>
            {d.reviewsReceived.map((r) => (
              <Line key={r.id} left={`★${r.rating} ${r.text ? `“${r.text}”` : ''}`} right={`${r.author.name} · ${r.role === 'DRIVER' ? t('prof.asDriver') : t('prof.asClient')}`} />
            ))}
          </Section>
          <Section title={t('adm.secReviewsOut')} count={d.reviewsWritten.length}>
            {d.reviewsWritten.map((r) => (
              <Line key={r.id} left={`★${r.rating} ${r.text ? `“${r.text}”` : ''}`} right={r.target.name} />
            ))}
          </Section>
          <Section title={t('adm.secAudit')} count={d.audit.length}>
            {d.audit.map((a) => (
              <Line key={a.id} left={`${a.action} · ${a.admin}`} right={`${dt(a.createdAt)}${a.ip ? ` · ${a.ip}` : ''}`} />
            ))}
          </Section>

          {u.role !== 'ADMIN' ? (
            <div className="row-wrap" style={{ gap: 8 }}>
              {u.isBlocked ? (
                <Button variant="ghost" loading={act.isPending} onClick={() => act.mutate({ path: `/admin/users/${u.id}/unblock` })}>
                  {t('adm.unblock')}
                </Button>
              ) : (
                <Button variant="danger" onClick={() => setBlocking(true)}>
                  {t('adm.block')}
                </Button>
              )}
            </div>
          ) : null}
          <ConfirmDialog
            open={blocking}
            title={t('adm.block')}
            message={t('adm.blockConfirm')}
            confirmLabel={t('adm.block')}
            danger
            loading={act.isPending}
            reasonLabel={t('adm.blockReason')}
            reasonPlaceholder={t('adm.blockReasonPh')}
            onClose={() => setBlocking(false)}
            onConfirm={(reason) => act.mutate({ path: `/admin/users/${u.id}/block`, body: { reason } })}
          />
        </div>
      )}
    </Modal>
  );
}

/* ───────── Eksport tugmasi ───────── */
export function ExportButton({ entity }: { entity: 'users' | 'trips' | 'bookings' | 'cargo' | 'ride-requests' }) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await download(`/admin/export/${entity}`, `abutax-${entity}.csv`);
        } catch (err) {
          toast(errorText(err, t), 'error');
        } finally {
          setBusy(false);
        }
      }}
    >
      <IconUpload size={16} style={{ transform: 'rotate(180deg)' }} /> {t('adm.export')}
    </Button>
  );
}

/* ───────── Mijozlar bazasi ───────── */
type AdminUser = Me & { blockReason?: string | null; driverProfile?: { status: string; ratingAvg: number; ratingCount: number } | null };

export function UsersDb() {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [blocked, setBlocked] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const q = useInfiniteQuery({
    queryKey: ['admin', 'users', search, role, blocked],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.page<AdminUser>('/admin/users', { q: search.trim().length >= 2 ? search.trim() : undefined, role: role || undefined, blocked: blocked || undefined, limit: 50, cursor: pageParam }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="stack">
      <div className="adm-filters">
        <Input placeholder={t('adm.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={role} onChange={(e) => setRole(e.target.value)} aria-label={t('adm.role')}>
          <option value="">{t('adm.allRoles')}</option>
          <option value="PASSENGER">PASSENGER</option>
          <option value="SENDER">SENDER</option>
          <option value="DRIVER">DRIVER</option>
          <option value="ADMIN">ADMIN</option>
        </Select>
        <Select value={blocked} onChange={(e) => setBlocked(e.target.value)} aria-label={t('adm.blocked')}>
          <option value="">{t('adm.allStatuses')}</option>
          <option value="true">{t('adm.blocked')}</option>
          <option value="false">{t('adm.active')}</option>
        </Select>
        <ExportButton entity="users" />
      </div>
      {q.isPending ? (
        <Skeleton height={56} count={6} />
      ) : q.isError ? (
        <ErrorState message={errorText(q.error, t)} onRetry={() => q.refetch()} />
      ) : !items.length ? (
        <Empty title={t('adm.noDrivers')} />
      ) : (
        <div className="adm-table" role="table">
          <div className="adm-tr adm-th" role="row">
            <span>{t('adm.colName')}</span>
            <span>{t('adm.colPhone')}</span>
            <span>{t('adm.role')}</span>
            <span>{t('profile.rating')}</span>
            <span>{t('adm.registered')}</span>
          </div>
          {items.map((u) => {
            const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || '—';
            return (
              <button key={u.id} type="button" className="adm-tr" role="row" onClick={() => setOpen(u.id)}>
                <span className="row" style={{ gap: 8, minWidth: 0 }}>
                  <Avatar name={name} url={u.avatarUrl} size={32} />
                  <span style={{ minWidth: 0 }}>
                    <b className="ellipsis">{name}</b>
                    {u.isBlocked ? <span className="badge badge-red" style={{ height: 20, marginLeft: 6 }} title={u.blockReason ?? undefined}>{t('adm.blocked')}</span> : null}
                  </span>
                </span>
                <span className="num small">{phoneDisplay(u.phone)}</span>
                <span className="small">
                  {u.role ?? '—'}
                  {u.driverProfile ? <span className="muted"> · {t(`status.${u.driverProfile.status}` as MessageKey)}</span> : null}
                </span>
                <span className="small">{u.driverProfile?.ratingCount ? `★ ${u.driverProfile.ratingAvg.toFixed(1)} (${u.driverProfile.ratingCount})` : '—'}</span>
                <span className="small muted">{day(u.createdAt)}</span>
              </button>
            );
          })}
        </div>
      )}
      {q.hasNextPage ? (
        <Button variant="ghost" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage} style={{ alignSelf: 'center' }}>
          {t('common.more')}
        </Button>
      ) : null}
      {open ? <UserDetailModal id={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

/* ───────── Umumiy jadval: safarlar, bronlar, yuklar, sharhlar ───────── */
interface TableCfg<T> {
  key: string;
  path: string;
  statuses: string[];
  exportEntity?: 'trips' | 'bookings' | 'cargo';
  head: string[];
  row: (r: T, openUser: (id: string) => void) => ReactNode[];
  rowKey: (r: T) => string;
  extra?: (r: T) => ReactNode;
}

export function AdminTable<T>({ cfg }: { cfg: TableCfg<T> }) {
  const { t } = useI18n();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const q = useInfiniteQuery({
    queryKey: ['admin', cfg.key, status, search],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.page<T>(cfg.path, { status: status || undefined, q: search.trim().length >= 2 ? search.trim() : undefined, limit: 50, cursor: pageParam }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="stack">
      <div className="adm-filters">
        <Input placeholder={t('adm.searchPhone')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('adm.status')}>
          <option value="">{t('adm.allStatuses')}</option>
          {cfg.statuses.map((s) => (
            <option key={s} value={s}>
              {s === 'LOW' ? t('adm.lowRatings') : t(`status.${s}` as MessageKey)}
            </option>
          ))}
        </Select>
        {cfg.exportEntity ? <ExportButton entity={cfg.exportEntity} /> : <span />}
      </div>
      {q.isPending ? (
        <Skeleton height={56} count={6} />
      ) : q.isError ? (
        <ErrorState message={errorText(q.error, t)} onRetry={() => q.refetch()} />
      ) : !items.length ? (
        <Empty title={t('adm.noDrivers')} />
      ) : (
        <div className="adm-table" role="table" style={{ ['--cols' as string]: cfg.head.length }}>
          <div className="adm-tr adm-th adm-tr-n" role="row">
            {cfg.head.map((h) => (
              <span key={h}>{h}</span>
            ))}
          </div>
          {items.map((r) => (
            <div key={cfg.rowKey(r)} className="adm-tr adm-tr-n" role="row">
              {cfg.row(r, setOpen).map((cell, i) => (
                <span key={i} className="small" style={{ minWidth: 0 }}>
                  {cell}
                </span>
              ))}
              {cfg.extra ? <span className="adm-extra">{cfg.extra(r)}</span> : null}
            </div>
          ))}
        </div>
      )}
      {q.hasNextPage ? (
        <Button variant="ghost" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage} style={{ alignSelf: 'center' }}>
          {t('common.more')}
        </Button>
      ) : null}
      {open ? <UserDetailModal id={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

const who = (u: Brief, openUser: (id: string) => void) => (
  <button type="button" className="link-btn" onClick={() => openUser(u.id)}>
    <b>{u.name}</b>
    <span className="muted" style={{ display: 'block' }}>
      {phoneDisplay(u.phone)}
    </span>
  </button>
);
const routeOf = (f: CityName, to: CityName) => `${f.nameUz} → ${to.nameUz}`;

interface TripRow { id: string; status: string; from: CityName; to: CityName; departureAt: string; totalSeats: number; availableSeats: number; pricePerSeat: number; bookings: number; driver: Brief; vehicle: { model: string; plateNumber: string } }
interface BookingRow { id: string; status: string; seats: number; totalPrice: number; cancelledLate: boolean; departureAt: string; from: CityName; to: CityName; passenger: Brief; driver: Brief }
interface CargoRow { id: string; status: string; type: string; weightKg: number; date: string; offeredPrice: number | null; from: CityName; to: CityName; offers: number; sender: Brief }
interface ReviewRow { id: string; rating: number; text: string | null; role: string; createdAt: string; author: Brief; target: Brief }

export function TripsDb() {
  const { t } = useI18n();
  return (
    <AdminTable<TripRow>
      cfg={{
        key: 'trips',
        path: '/admin/trips',
        statuses: ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
        exportEntity: 'trips',
        head: [t('adm.colRoute'), t('adm.colDriver'), t('adm.colSeats'), t('adm.colPrice'), t('adm.status')],
        rowKey: (r) => r.id,
        row: (r, o) => [
          <>
            <b>{routeOf(r.from, r.to)}</b>
            <span className="muted" style={{ display: 'block' }}>{dt(r.departureAt)}</span>
          </>,
          who(r.driver, o),
          `${r.totalSeats - r.availableSeats}/${r.totalSeats} · ${r.vehicle.plateNumber}`,
          money(r.pricePerSeat),
          <StatusBadge status={r.status} />,
        ],
      }}
    />
  );
}

export function BookingsDb() {
  const { t } = useI18n();
  return (
    <AdminTable<BookingRow>
      cfg={{
        key: 'bookings',
        path: '/admin/bookings',
        statuses: ['PENDING', 'CONFIRMED', 'COMPLETED', 'REJECTED', 'CANCELLED'],
        exportEntity: 'bookings',
        head: [t('adm.colRoute'), t('adm.colPassenger'), t('adm.colDriver'), t('adm.colPrice'), t('adm.status')],
        rowKey: (r) => r.id,
        row: (r, o) => [
          <>
            <b>{routeOf(r.from, r.to)}</b>
            <span className="muted" style={{ display: 'block' }}>{dt(r.departureAt)}</span>
          </>,
          who(r.passenger, o),
          who(r.driver, o),
          `${r.seats} · ${money(r.totalPrice)}${r.cancelledLate ? ' ⚠️' : ''}`,
          <StatusBadge status={r.status} />,
        ],
      }}
    />
  );
}

export function CargoDb() {
  const { t } = useI18n();
  return (
    <AdminTable<CargoRow>
      cfg={{
        key: 'cargo',
        path: '/admin/cargo',
        statuses: ['OPEN', 'MATCHED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'],
        exportEntity: 'cargo',
        head: [t('adm.colRoute'), t('adm.colSender'), t('adm.colCargo'), t('adm.colOffers'), t('adm.status')],
        rowKey: (r) => r.id,
        row: (r, o) => [
          <>
            <b>{routeOf(r.from, r.to)}</b>
            <span className="muted" style={{ display: 'block' }}>{day(r.date)}</span>
          </>,
          who(r.sender, o),
          `${t(`cargo.${r.type}` as MessageKey)} · ${r.weightKg} kg${r.offeredPrice ? ` · ${money(r.offeredPrice)}` : ''}`,
          r.offers,
          <StatusBadge status={r.status} />,
        ],
      }}
    />
  );
}

export function ReviewsDb() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [del, setDel] = useState<ReviewRow | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/admin/reviews/${id}`),
    onSuccess: () => {
      setDel(null);
      toast(t('adm.reviewDeleted'));
      void qc.invalidateQueries({ queryKey: ['admin', 'reviews'] });
    },
  });
  return (
    <>
      <AdminTable<ReviewRow>
        cfg={{
          key: 'reviews',
          path: '/admin/reviews',
          statuses: ['LOW'],
          head: [t('adm.colRating'), t('adm.colText'), t('adm.colAuthor'), t('adm.colTarget'), ''],
          rowKey: (r) => r.id,
          row: (r, o) => [
            <b style={{ color: r.rating <= 2 ? 'var(--danger)' : undefined }}>★ {r.rating}</b>,
            <>
              {r.text ?? <span className="muted">—</span>}
              <span className="muted" style={{ display: 'block' }}>{relativeTime(r.createdAt, 'UZ')}</span>
            </>,
            who(r.author, o),
            <>
              {who(r.target, o)}
              <span className="muted">{r.role === 'DRIVER' ? t('prof.asDriver') : t('prof.asClient')}</span>
            </>,
            <Button size="sm" variant="ghost" onClick={() => setDel(r)}>
              {t('adm.delete')}
            </Button>,
          ],
        }}
      />
      <ConfirmDialog
        open={!!del}
        title={t('adm.delete')}
        message={t('adm.reviewDeleteConfirm')}
        confirmLabel={t('adm.delete')}
        danger
        loading={remove.isPending}
        onClose={() => setDel(null)}
        onConfirm={() => del && remove.mutate(del.id)}
      />
    </>
  );
}

/* ───────── Jurnal ───────── */
interface AuditRow { id: string; action: string; targetType: string; targetId: string; ip: string | null; createdAt: string; meta: unknown; admin: { firstName: string | null; lastName: string | null } }

export function AuditDb() {
  const { t } = useI18n();
  const q = useInfiniteQuery({
    queryKey: ['admin', 'audit'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.page<AuditRow>('/admin/audit', { limit: 50, cursor: pageParam }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  if (q.isPending) return <Skeleton height={48} count={6} />;
  if (q.isError) return <ErrorState message={errorText(q.error, t)} onRetry={() => q.refetch()} />;
  return (
    <div className="stack-sm">
      <p className="small muted" style={{ margin: 0 }}>
        {t('adm.auditHint')}
      </p>
      {items.map((a) => (
        <div key={a.id} className="adm-line">
          <span style={{ flex: 1, minWidth: 0 }}>
            <b>{a.action}</b> · {[a.admin.firstName, a.admin.lastName].filter(Boolean).join(' ')}
            <span className="small muted" style={{ display: 'block' }}>
              {a.targetType}: <code>{a.targetId}</code>
            </span>
          </span>
          <span className="small muted">
            {dt(a.createdAt)}
            {a.ip ? ` · ${a.ip}` : ''}
          </span>
        </div>
      ))}
      {q.hasNextPage ? (
        <Button variant="ghost" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage} style={{ alignSelf: 'center' }}>
          {t('common.more')}
        </Button>
      ) : null}
    </div>
  );
}

/* ───────── Sozlamalar: parol ───────── */
export function AdminSettings() {
  const { t } = useI18n();
  const { logout } = useAuth();
  const toast = useToast();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const change = useMutation({
    mutationFn: () => api.post('/admin/me/password', { ...(cur ? { currentPassword: cur } : {}), newPassword: next }),
    onSuccess: async () => {
      toast(t('adm.pwChanged'));
      await logout();
    },
  });
  const mismatch = !!again && next !== again;
  return (
    <form
      className="card stack"
      style={{ maxWidth: 480 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!mismatch) change.mutate();
      }}
    >
      <b>{t('adm.pwTitle')}</b>
      <p className="small muted" style={{ margin: 0 }}>
        {t('adm.pwHint')}
      </p>
      <Input label={t('adm.pwCurrent')} type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
      <Input label={t('adm.pwNew')} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} minLength={12} required />
      <Input label={t('adm.pwAgain')} type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required error={mismatch ? t('adm.pwMismatch') : undefined} />
      {change.isError ? <Alert kind="error">{errorText(change.error, t)}</Alert> : null}
      <Button type="submit" loading={change.isPending} disabled={!next || mismatch}>
        {t('common.save')}
      </Button>
    </form>
  );
}
