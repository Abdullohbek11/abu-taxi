import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { IconCheck, IconSend, IconUpload } from '../../components/Icons';
import { Alert, Button, ErrorState, Skeleton, StatusBadge, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import { errorText } from '../../lib/errors';
import { money, tashkentDateKey, dayLabel } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import type { BillingPlan, Payment } from '../../lib/types';
import type { MessageKey } from '../../locales/uz';

/** 8600123456789012 → 8600 1234 5678 9012 */
const cardFmt = (n: string) => n.replace(/(\d{4})(?=\d)/g, '$1 ');

/**
 * Haydovchi tarifi (30 kun): holat, karta rekvizitlari, chek yuborish (saytga yoki Telegram'ga), Payme / Click.
 * To'lovni admin tasdiqlaydi — shundan keyin yo'lovchilarni tasdiqlash, so'rov va yuk olish ochiladi.
 */
export default function DriverTariff() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const q = useQuery({ queryKey: ['billing', 'plan'], queryFn: () => api.get<BillingPlan>('/billing/plan') });

  const send = useMutation({
    mutationFn: () => {
      const form = new FormData();
      if (file) form.append('file', file);
      if (note.trim()) form.append('note', note.trim());
      return api.upload<Payment>('/billing/payments', form);
    },
    onSuccess: () => {
      setFile(null);
      setNote('');
      toast(t('bill.sent'));
      void qc.invalidateQueries({ queryKey: ['billing'] });
    },
  });
  const online = useMutation({
    mutationFn: (provider: 'payme' | 'click') => api.post<{ url: string }>('/billing/payments/online', { provider }),
    onSuccess: (r) => {
      window.location.href = r.url;
    },
    onError: (err) => toast(errorText(err, t), 'error'),
  });

  if (q.isPending) return <div className="page page-narrow"><Skeleton height={160} count={2} /></div>;
  if (q.isError) return <div className="page page-narrow"><ErrorState message={errorText(q.error, t)} onRetry={() => q.refetch()} /></div>;
  const p = q.data;
  const until = p.subscription.until ? dayLabel(tashkentDateKey(new Date(p.subscription.until)), lang, t) : null;
  const pending = p.payments.find((x) => x.status === 'PENDING');
  const tgText = encodeURIComponent(t('bill.tgText', { price: money(p.price) }));

  return (
    <div className="page page-narrow stack" style={{ gap: 20 }}>
      <div className="row between" style={{ flexWrap: 'wrap' }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          {t('bill.title')}
        </h1>
        <Link to="/driver" className="btn btn-ghost btn-sm">
          ← {t('drv.title')}
        </Link>
      </div>

      {!p.enabled ? (
        <Alert kind="success">{t('bill.free')}</Alert>
      ) : (
        <div className={`card tariff-status ${p.subscription.active ? 'ok' : 'off'}`}>
          <span className="tariff-icon">{p.subscription.active ? <IconCheck size={22} /> : '💳'}</span>
          <div style={{ flex: 1 }}>
            <b style={{ fontSize: 18 }}>{p.subscription.active ? t('bill.active', { date: until ?? '' }) : t('bill.inactive')}</b>
            <div className="small muted">{p.subscription.active ? t('bill.activeHint') : t('bill.inactiveHint')}</div>
          </div>
        </div>
      )}

      {p.enabled ? (
        <>
          <div className="card stack tariff-price">
            <div className="row between" style={{ alignItems: 'baseline' }}>
              <span className="muted">{t('bill.plan', { days: p.days })}</span>
              <b className="head-num" style={{ fontSize: 28 }}>
                {money(p.price)} <span className="small muted">{t('common.som')}</span>
              </b>
            </div>
            <ul className="tariff-perks">
              <li>✓ {t('bill.perk1')}</li>
              <li>✓ {t('bill.perk2')}</li>
              <li>✓ {t('bill.perk3')}</li>
              <li>✓ {t('bill.perk4')}</li>
            </ul>
          </div>

          {pending ? (
            <Alert kind="info">
              ⏳ {t('bill.pending', { sum: money(pending.amount) })}
            </Alert>
          ) : null}

          {p.providers.payme || p.providers.click ? (
            <div className="card stack">
              <b>{t('bill.online')}</b>
              <div className="grid-2" style={{ gap: 8 }}>
                {p.providers.payme ? (
                  <Button size="lg" variant="ghost" loading={online.isPending && online.variables === 'payme'} onClick={() => online.mutate('payme')}>
                    <span className="pay-logo payme">Payme</span> {t('bill.payWith')}
                  </Button>
                ) : null}
                {p.providers.click ? (
                  <Button size="lg" variant="ghost" loading={online.isPending && online.variables === 'click'} onClick={() => online.mutate('click')}>
                    <span className="pay-logo click">Click</span> {t('bill.payWith')}
                  </Button>
                ) : null}
              </div>
              <span className="small muted">{t('bill.onlineHint')}</span>
            </div>
          ) : null}

          {p.card ? (
            <div className="card stack">
              <b>{t('bill.byCard')}</b>
              <div className="bank-card">
                <span className="small" style={{ opacity: 0.7 }}>
                  {t('bill.cardLabel')}
                </span>
                <b className="num">{cardFmt(p.card.number)}</b>
                <span>{p.card.holder}</span>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(p.card!.number);
                      toast(t('bill.copied'));
                    } catch {
                      toast(p.card!.number);
                    }
                  }}
                >
                  {t('bill.copy')}
                </button>
              </div>
              <ol className="tariff-steps small">
                <li>{t('bill.step1', { sum: money(p.price) })}</li>
                <li>{t('bill.step2')}</li>
                <li>{t('bill.step3')}</li>
              </ol>

              <div className="stack-sm">
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                <Button variant="ghost" onClick={() => fileRef.current?.click()} disabled={!!pending}>
                  <IconUpload size={16} /> {file ? file.name : t('bill.attach')}
                </Button>
                <Textarea label={t('bill.note')} placeholder={t('bill.notePh')} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} disabled={!!pending} />
                {send.isError ? <Alert kind="error">{errorText(send.error, t)}</Alert> : null}
                <Button size="lg" block loading={send.isPending} disabled={!!pending || (!file && !note.trim())} onClick={() => send.mutate()}>
                  {t('bill.sendReceipt')}
                </Button>
                {p.telegramUsername ? (
                  <a className="btn btn-dark btn-block" href={`https://t.me/${p.telegramUsername}?text=${tgText}`} target="_blank" rel="noreferrer">
                    <IconSend /> {t('bill.sendTelegram', { username: p.telegramUsername })}
                  </a>
                ) : null}
              </div>
            </div>
          ) : !p.providers.payme && !p.providers.click ? (
            <Alert kind="warning">{t('bill.notConfigured')}</Alert>
          ) : null}
        </>
      ) : null}

      {p.payments.length ? (
        <div className="card stack-sm">
          <b>{t('bill.history')}</b>
          {p.payments.map((x) => (
            <div key={x.id} className="adm-line">
              <span style={{ flex: 1 }}>
                <b className="num">{money(x.amount)}</b> · {t(`bill.m.${x.method}` as MessageKey)} · {x.days} {t('bill.daysShort')}
                {x.rejectReason ? <span className="small" style={{ display: 'block', color: 'var(--danger)' }}>{x.rejectReason}</span> : null}
              </span>
              <span className="small muted">{dayLabel(tashkentDateKey(new Date(x.createdAt)), lang, t)}</span>
              <StatusBadge status={x.status} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
