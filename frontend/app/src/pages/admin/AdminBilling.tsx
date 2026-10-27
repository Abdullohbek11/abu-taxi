import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, ConfirmDialog, Empty, ErrorState, Input, Modal, Segmented, Skeleton, StatusBadge } from '../../components/ui';
import { api } from '../../lib/api';
import { errorText, fieldErrors } from '../../lib/errors';
import { money, phoneDisplay } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import type { AdminPayment, BillingSettings, PaymentStatus } from '../../lib/types';
import type { MessageKey } from '../../locales/uz';

const dt = (iso: string) => new Date(iso).toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Tushgan to'lovlar: chekni ko'rish, tasdiqlash (obuna uzayadi) yoki sabab bilan rad etish. */
export function PaymentsDb() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<PaymentStatus>('PENDING');
  const [rejecting, setRejecting] = useState<AdminPayment | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const q = useInfiniteQuery({
    queryKey: ['admin', 'payments', status],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.page<AdminPayment>('/admin/payments', { status, limit: 50, cursor: pageParam }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: 30_000,
  });
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api.post(path, body),
    onSuccess: () => {
      setRejecting(null);
      toast(t('adm.saved'));
      void qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (err) => toast(errorText(err, t), 'error'),
  });
  const openReceipt = async (id: string) => {
    try {
      setReceipt((await api.get<{ url: string }>(`/admin/payments/${id}/receipt`)).url);
    } catch (err) {
      toast(errorText(err, t), 'error');
    }
  };
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="stack">
      <Segmented<PaymentStatus>
        value={status}
        onChange={setStatus}
        options={(['PENDING', 'CONFIRMED', 'REJECTED'] as const).map((s) => ({ value: s, label: t(`status.${s}` as MessageKey) }))}
      />
      {q.isPending ? (
        <Skeleton height={90} count={3} />
      ) : q.isError ? (
        <ErrorState message={errorText(q.error, t)} onRetry={() => q.refetch()} />
      ) : !items.length ? (
        <Empty title={status === 'PENDING' ? t('bill.noPending') : t('adm.noDrivers')} />
      ) : (
        items.map((p) => (
          <div key={p.id} className={`card stack-sm ${p.status === 'PENDING' ? 'card-pending' : ''}`}>
            <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
              <span>
                <b>{p.user.name}</b> <span className="muted small">{phoneDisplay(p.user.phone)}</span>
                {p.user.telegramUsername ? <span className="muted small"> · @{p.user.telegramUsername}</span> : null}
              </span>
              <StatusBadge status={p.status} />
            </div>
            <div className="row-wrap small" style={{ gap: 12 }}>
              <b className="head-num" style={{ fontSize: 18 }}>
                {money(p.amount)} {t('common.som')}
              </b>
              <span className="badge">{t(`bill.m.${p.method}` as MessageKey)}</span>
              <span className="muted">
                {p.days} {t('bill.daysShort')} · {dt(p.createdAt)}
              </span>
              {p.user.subscriptionUntil ? <span className="muted">{t('bill.until', { date: dt(p.user.subscriptionUntil) })}</span> : null}
            </div>
            {p.note ? <p style={{ margin: 0 }}>“{p.note}”</p> : null}
            {p.rejectReason ? <Alert kind="error">{p.rejectReason}</Alert> : null}
            <div className="row-wrap" style={{ gap: 8 }}>
              {p.hasReceipt ? (
                <Button size="sm" variant="ghost" onClick={() => openReceipt(p.id)}>
                  🧾 {t('bill.viewReceipt')}
                </Button>
              ) : null}
              {p.status === 'PENDING' ? (
                <>
                  <Button size="sm" variant="success" loading={act.isPending} onClick={() => act.mutate({ path: `/admin/payments/${p.id}/confirm` })}>
                    {t('bill.confirm', { days: p.days })}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRejecting(p)}>
                    {t('common.reject')}
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        ))
      )}
      {q.hasNextPage ? (
        <Button variant="ghost" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage} style={{ alignSelf: 'center' }}>
          {t('common.more')}
        </Button>
      ) : null}
      <ConfirmDialog
        open={!!rejecting}
        title={t('common.reject')}
        confirmLabel={t('common.reject')}
        danger
        loading={act.isPending}
        reasonLabel={t('bill.rejectReason')}
        reasonPlaceholder={t('bill.rejectReasonPh')}
        onClose={() => setRejecting(null)}
        onConfirm={(reason) => rejecting && act.mutate({ path: `/admin/payments/${rejecting.id}/reject`, body: { reason } })}
      />
      {receipt ? (
        <Modal open onClose={() => setReceipt(null)} title={t('bill.viewReceipt')}>
          <img src={receipt} alt="" style={{ width: '100%', borderRadius: 12 }} />
        </Modal>
      ) : null}
    </div>
  );
}

/** Tarif sozlamalari: yoqish, narx, kunlar, sinov, karta, Telegram, Payme / Click. */
export function BillingSettingsForm() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['admin', 'billing-settings'], queryFn: () => api.get<BillingSettings>('/admin/billing/settings') });
  const [f, setF] = useState<BillingSettings | null>(null);
  useEffect(() => {
    if (q.data && !f) setF(q.data);
  }, [q.data, f]);
  const save = useMutation({
    mutationFn: (v: BillingSettings) => api.put<BillingSettings>('/admin/billing/settings', v),
    onSuccess: (v) => {
      setF(v);
      toast(t('adm.saved'));
      void qc.invalidateQueries({ queryKey: ['admin'] });
    },
  });
  if (q.isPending || !f) return <Skeleton height={80} count={4} />;
  if (q.isError) return <ErrorState message={errorText(q.error, t)} onRetry={() => q.refetch()} />;
  const fe = fieldErrors(save.error);
  const num = (k: 'price' | 'days' | 'trialDays') => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: Number(e.target.value.replace(/\D/g, '')) || 0 });
  const str = (k: keyof BillingSettings) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const enabling = f.enabled && !q.data?.enabled;
  return (
    <form
      className="stack"
      style={{ maxWidth: 640 }}
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(f);
      }}
    >
      <div className={`card stack tariff-switch ${f.enabled ? 'on' : ''}`}>
        <Checkbox label={<b>{t('bill.enable')}</b>} checked={f.enabled} onChange={(v) => setF({ ...f, enabled: v })} />
        <span className="small muted">{t('bill.enableHint')}</span>
        {enabling && !f.cardNumber && !f.paymeMerchantId && !f.clickServiceId ? <Alert kind="warning">{t('bill.needRequisites')}</Alert> : null}
      </div>
      <div className="card stack">
        <b>{t('bill.sPrice')}</b>
        <div className="grid-3">
          <Input label={t('bill.price')} inputMode="numeric" value={String(f.price)} onChange={num('price')} hint={`${money(f.price)} ${t('common.som')}`} error={fe.price} />
          <Input label={t('bill.days')} inputMode="numeric" value={String(f.days)} onChange={num('days')} error={fe.days} />
          <Input label={t('bill.trial')} inputMode="numeric" value={String(f.trialDays)} onChange={num('trialDays')} hint={t('bill.trialHint')} error={fe.trialDays} />
        </div>
      </div>
      <div className="card stack">
        <b>{t('bill.sCard')}</b>
        <div className="grid-2">
          <Input label={t('bill.cardNumber')} inputMode="numeric" placeholder="8600 0000 0000 0000" value={f.cardNumber} onChange={str('cardNumber')} error={fe.cardNumber} />
          <Input label={t('bill.cardHolder')} placeholder="ABDULLOH R." value={f.cardHolder} onChange={str('cardHolder')} error={fe.cardHolder} />
          <Input label={t('bill.telegram')} placeholder="abutax_uz" value={f.telegramUsername} onChange={str('telegramUsername')} hint={t('bill.telegramHint')} error={fe.telegramUsername} />
        </div>
      </div>
      <div className="card stack">
        <b>Payme / Click</b>
        <span className="small muted">{t('bill.merchantHint')}</span>
        <div className="grid-3">
          <Input label="Payme merchant ID" value={f.paymeMerchantId} onChange={str('paymeMerchantId')} error={fe.paymeMerchantId} />
          <Input label="Click service_id" inputMode="numeric" value={f.clickServiceId} onChange={str('clickServiceId')} error={fe.clickServiceId} />
          <Input label="Click merchant_id" inputMode="numeric" value={f.clickMerchantId} onChange={str('clickMerchantId')} error={fe.clickMerchantId} />
        </div>
      </div>
      {save.isError && !Object.keys(fe).length ? <Alert kind="error">{errorText(save.error, t)}</Alert> : null}
      <Button type="submit" size="lg" loading={save.isPending} style={{ alignSelf: 'flex-start' }}>
        {t('common.save')}
      </Button>
    </form>
  );
}

/** Mijoz kartasidan: qo'lda obuna berish (chek Telegram'da kelgan, naqd to'lov, bonus). */
export function GrantSubscription({ userId, until }: { userId: string; until: string | null }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState('30');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const grant = useMutation({
    mutationFn: () => api.post(`/admin/users/${userId}/subscription`, { days: Number(days), ...(amount ? { amount: Number(amount) } : {}), ...(note.trim() ? { note: note.trim() } : {}) }),
    onSuccess: () => {
      setOpen(false);
      toast(t('adm.saved'));
      void qc.invalidateQueries({ queryKey: ['admin'] });
    },
  });
  const active = !!until && new Date(until).getTime() > Date.now();
  return (
    <div className="row-wrap" style={{ gap: 8 }}>
      <span className={`badge ${active ? 'badge-green' : ''}`}>{active ? t('bill.until', { date: dt(until!) }) : t('bill.noSub')}</span>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        💳 {t('bill.grant')}
      </Button>
      {open ? (
        <Modal open onClose={() => setOpen(false)} title={t('bill.grant')}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              grant.mutate();
            }}
          >
            <div className="grid-2">
              <Input label={t('bill.days')} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))} required />
              <Input label={t('bill.amountPaid')} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} hint={amount ? money(Number(amount)) : undefined} />
            </div>
            <Input label={t('bill.note')} placeholder={t('bill.grantNotePh')} value={note} onChange={(e) => setNote(e.target.value)} />
            {grant.isError ? <Alert kind="error">{errorText(grant.error, t)}</Alert> : null}
            <Button type="submit" size="lg" block loading={grant.isPending} disabled={!Number(days)}>
              {t('bill.grant')}
            </Button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
