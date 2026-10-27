import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminOverview, AdminSettings, AuditDb, BookingsDb, CargoDb, ReviewsDb, TripsDb, UsersDb } from './AdminData';
import { BillingSettingsForm, PaymentsDb } from './AdminBilling';
import { AssignedDriver, RideRequestCard } from '../../components/RideRequestCard';
import { Alert, Button, ConfirmDialog, Empty, ErrorState, Input, Modal, Segmented, Skeleton, StatusBadge } from '../../components/ui';
import { api } from '../../lib/api';
import { errorText } from '../../lib/errors';
import { phoneDisplay } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import type { DriverStatus, RideRequest, RideRequestStatus, Vehicle } from '../../lib/types';
import type { MessageKey } from '../../locales/uz';

interface AdminDriver {
  id: string;
  status: DriverStatus;
  rejectReason: string | null;
  user: { id: string; phone: string | null; firstName: string | null; lastName: string | null; telegramUsername: string | null };
  vehicles: Vehicle[];
  documents: { id: string; type: string; status: DriverStatus }[];
}

function Drivers() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<DriverStatus>('PENDING');
  const [rejecting, setRejecting] = useState<AdminDriver | null>(null);
  const q = useQuery({ queryKey: ['admin', 'drivers', status], queryFn: () => api.page<AdminDriver>('/admin/drivers', { status, limit: 50 }) });
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api.post(path, body),
    onSuccess: () => {
      setRejecting(null);
      void qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (err) => toast(errorText(err, t), 'error'),
  });
  const openDoc = async (id: string) => {
    try {
      const d = await api.get<{ url: string }>(`/admin/documents/${id}`);
      window.open(d.url, '_blank', 'noopener');
    } catch (err) {
      toast(errorText(err, t), 'error');
    }
  };
  return (
    <div className="stack">
      <Segmented value={status} onChange={setStatus} options={[{ value: 'PENDING', label: t('adm.pending') }, { value: 'APPROVED', label: t('adm.approved') }, { value: 'REJECTED', label: t('adm.rejected') }]} />
      {q.isPending ? <Skeleton /> : q.isError ? <ErrorState message={errorText(q.error, t)} onRetry={() => q.refetch()} /> : !q.data.items.length ? <Empty title={t('adm.noDrivers')} /> : q.data.items.map((d) => (
        <div key={d.id} className="card stack-sm">
          <div className="row between">
            <b>{[d.user.firstName, d.user.lastName].filter(Boolean).join(' ')}</b>
            <StatusBadge status={d.status} />
          </div>
          <div className="small muted">{phoneDisplay(d.user.phone)}{d.user.telegramUsername ? ` · @${d.user.telegramUsername}` : ''}</div>
          {d.vehicles.map((v) => <div key={v.id} className="small">{v.model} · {v.plateNumber} · {v.seats} <StatusBadge status={v.status} /></div>)}
          <div className="row-wrap">
            {d.documents.map((doc) => <Button key={doc.id} size="sm" variant="ghost" onClick={() => openDoc(doc.id)}>{t(`drv.doc${doc.type}` as MessageKey)}</Button>)}
          </div>
          {d.status !== 'APPROVED' ? (
            <div className="row-wrap">
              <Button size="sm" variant="success" onClick={() => act.mutate({ path: `/admin/drivers/${d.id}/approve` })}>{t('adm.approve')}</Button>
              <Button size="sm" variant="danger" onClick={() => setRejecting(d)}>{t('adm.reject')}</Button>
            </div>
          ) : null}
        </div>
      ))}
      <ConfirmDialog
        open={!!rejecting}
        title={`${t('adm.reject')}: ${[rejecting?.user.firstName, rejecting?.user.lastName].filter(Boolean).join(' ')}`}
        reasonLabel={t('adm.rejectReason')}
        reasonPlaceholder={t('adm.rejectReasonPh')}
        confirmLabel={t('adm.reject')}
        danger
        loading={act.isPending}
        onClose={() => setRejecting(null)}
        onConfirm={(reason) => rejecting && act.mutate({ path: `/admin/drivers/${rejecting.id}/reject`, body: { reason } })}
      />
    </div>
  );
}

/** Tizimda yo'q haydovchini qo'lda biriktirish (masalan, guruhda kelishilgan) — yo'lovchiga bot orqali xabar boradi. */
function AssignModal({ r, onClose }: { r: RideRequest; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({ driverName: '', driverPhone: '+998', carModel: '', carColor: '', carPlate: '', pricePerSeat: r.offeredPrice ? String(r.offeredPrice) : '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const assign = useMutation({
    mutationFn: () =>
      api.post(`/admin/ride-requests/${r.id}/assign`, {
        driverName: f.driverName,
        driverPhone: f.driverPhone,
        carModel: f.carModel,
        ...(f.carColor.trim() ? { carColor: f.carColor } : {}),
        ...(f.carPlate.trim() ? { carPlate: f.carPlate } : {}),
        pricePerSeat: Number(f.pricePerSeat.replace(/\D/g, '')),
      }),
    onSuccess: () => {
      toast(t('rr.assignedToast'));
      void qc.invalidateQueries({ queryKey: ['admin', 'rideRequests'] });
      onClose();
    },
  });
  return (
    <Modal open onClose={onClose} title={t('rr.assignTitle')}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          assign.mutate();
        }}
      >
        <div className="grid-2">
          <Input label={t('rr.driverName')} value={f.driverName} onChange={set('driverName')} required minLength={2} />
          <Input label={t('rr.driverPhone')} type="tel" value={f.driverPhone} onChange={set('driverPhone')} required />
          <Input label={t('rr.carModel')} placeholder="Chevrolet Cobalt" value={f.carModel} onChange={set('carModel')} required />
          <Input label={t('rr.carColor')} value={f.carColor} onChange={set('carColor')} />
          <Input label={t('rr.carPlate')} placeholder="01 A 777 AA" value={f.carPlate} onChange={set('carPlate')} />
          <Input label={t('rr.yourPrice')} inputMode="numeric" value={f.pricePerSeat} onChange={set('pricePerSeat')} required />
        </div>
        <Alert>{t('rr.assignNote')}</Alert>
        {assign.isError ? <Alert kind="error">{errorText(assign.error, t)}</Alert> : null}
        <Button type="submit" size="lg" block loading={assign.isPending}>
          {t('rr.assign')}
        </Button>
      </form>
    </Modal>
  );
}

function RideRequests() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [status, setStatus] = useState<RideRequestStatus>('OPEN');
  const [assigning, setAssigning] = useState<RideRequest | null>(null);
  const [cancelling, setCancelling] = useState<RideRequest | null>(null);
  const q = useQuery({ queryKey: ['admin', 'rideRequests', status], queryFn: () => api.page<RideRequest>('/admin/ride-requests', { status, limit: 50 }), refetchInterval: 30_000 });
  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/admin/ride-requests/${id}/cancel`),
    onSuccess: () => {
      setCancelling(null);
      void qc.invalidateQueries({ queryKey: ['admin', 'rideRequests'] });
    },
  });
  return (
    <div className="stack">
      <Segmented<RideRequestStatus>
        value={status}
        onChange={setStatus}
        options={(['OPEN', 'ASSIGNED', 'CANCELLED', 'EXPIRED'] as const).map((s) => ({ value: s, label: t(`status.${s}` as MessageKey) }))}
      />
      {q.isPending ? (
        <Skeleton />
      ) : q.isError ? (
        <ErrorState message={errorText(q.error, t)} onRetry={() => q.refetch()} />
      ) : !q.data.items.length ? (
        <Empty title={t('adm.noDrivers')} />
      ) : (
        q.data.items.map((r) => (
          <RideRequestCard
            key={r.id}
            r={r}
            badge={r.status === 'OPEN' ? <span className="badge">{r.groupPostedAt ? t('rr.inGroup') : t('rr.notified', { n: r.notifiedDrivers ?? 0 })}</span> : r.manual ? <span className="badge">{t('rr.manual')}</span> : null}
          >
            {r.passengerContact ? (
              <div className="small">
                👤 <b>{r.passengerContact.name}</b> · {phoneDisplay(r.passengerContact.phone)}
                {r.passengerContact.telegramUsername ? ` · @${r.passengerContact.telegramUsername}` : ''}
              </div>
            ) : null}
            {r.assignment ? <AssignedDriver a={r.assignment} /> : null}
            {r.status === 'OPEN' || r.status === 'ASSIGNED' ? (
              <div className="row-wrap" style={{ gap: 8 }}>
                {r.status === 'OPEN' ? <Button size="sm" onClick={() => setAssigning(r)}>{t('rr.assign')}</Button> : null}
                <Button size="sm" variant="ghost" onClick={() => setCancelling(r)}>{t('rr.cancel')}</Button>
              </div>
            ) : null}
          </RideRequestCard>
        ))
      )}
      {assigning ? <AssignModal r={assigning} onClose={() => setAssigning(null)} /> : null}
      <ConfirmDialog
        open={!!cancelling}
        title={t('rr.cancel')}
        message={t('rr.adminCancelConfirm')}
        confirmLabel={t('rr.cancel')}
        danger
        loading={cancel.isPending}
        onClose={() => setCancelling(null)}
        onConfirm={() => cancelling && cancel.mutate(cancelling.id)}
      />
    </div>
  );
}

type Section = 'overview' | 'users' | 'drivers' | 'payments' | 'billing' | 'requests' | 'trips' | 'bookings' | 'cargo' | 'reviews' | 'audit' | 'settings';
const SECTIONS: { id: Section; icon: string; label: MessageKey }[] = [
  { id: 'overview', icon: '📊', label: 'adm.sOverview' },
  { id: 'users', icon: '👥', label: 'adm.sUsers' },
  { id: 'drivers', icon: '🚗', label: 'adm.drivers' },
  { id: 'payments', icon: '💳', label: 'bill.sPayments' },
  { id: 'billing', icon: '🏷️', label: 'bill.sSettings' },
  { id: 'requests', icon: '🙋', label: 'rr.adminTab' },
  { id: 'trips', icon: '🛣️', label: 'adm.sTrips' },
  { id: 'bookings', icon: '🎫', label: 'adm.sBookings' },
  { id: 'cargo', icon: '📦', label: 'adm.sCargo' },
  { id: 'reviews', icon: '⭐', label: 'adm.sReviews' },
  { id: 'audit', icon: '🧾', label: 'adm.sAudit' },
  { id: 'settings', icon: '🔐', label: 'adm.sSettings' },
];

/**
 * Admin panel: butun loyiha bir joyda — statistika, mijozlar bazasi (har bir foydalanuvchining to'liq kartasi),
 * haydovchilarni tekshirish, so'rovlar, safarlar, bronlar, yuklar, sharhlar moderatsiyasi, amallar jurnali va CSV eksport.
 */
export default function Admin() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const section = (SECTIONS.find((s) => s.id === params.get('s'))?.id ?? 'overview') as Section;
  const go = (s: string) => setParams(s === 'overview' ? {} : { s }, { replace: false });
  const current = SECTIONS.find((s) => s.id === section)!;
  return (
    <div className="page admin-page">
      <aside className="admin-nav" aria-label={t('adm.title')}>
        <b className="admin-nav-title">{t('adm.title')}</b>
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" className={s.id === section ? 'on' : ''} onClick={() => go(s.id)} aria-current={s.id === section ? 'page' : undefined}>
            <span aria-hidden>{s.icon}</span> {t(s.label)}
          </button>
        ))}
      </aside>
      <section className="stack admin-main" style={{ minWidth: 0 }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          {current.icon} {t(current.label)}
        </h1>
        {section === 'overview' ? (
          <AdminOverview go={go} />
        ) : section === 'users' ? (
          <UsersDb />
        ) : section === 'drivers' ? (
          <Drivers />
        ) : section === 'payments' ? (
          <PaymentsDb />
        ) : section === 'billing' ? (
          <BillingSettingsForm />
        ) : section === 'requests' ? (
          <RideRequests />
        ) : section === 'trips' ? (
          <TripsDb />
        ) : section === 'bookings' ? (
          <BookingsDb />
        ) : section === 'cargo' ? (
          <CargoDb />
        ) : section === 'reviews' ? (
          <ReviewsDb />
        ) : section === 'audit' ? (
          <AuditDb />
        ) : (
          <AdminSettings />
        )}
      </section>
    </div>
  );
}
