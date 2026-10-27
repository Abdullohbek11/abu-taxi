import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { errorText } from '../lib/errors';
import { addDays, tashkentDateKey } from '../lib/format';
import { useI18n } from '../lib/i18n';
import type { RideRequest } from '../lib/types';
import { IconCheck, IconSend } from './Icons';
import { Alert, Button, Input, Stepper, Textarea } from './ui';

/**
 * Safar topilmaganda: yo'lovchi so'rov qoldiradi. Backend uni avval shu yo'nalishdagi haydovchilarga
 * (bot orqali) yuboradi, hech kim olmasa — Telegram guruhga. Haydovchi topilsa, yo'lovchiga
 * ismi, mashinasi, narxi va telefoni Telegram'da va "Mening safarlarim"da ko'rinadi.
 */
export function RideRequestForm({ fromCityId, toCityId, date, seats: initialSeats }: { fromCityId: string; toCityId: string; date: string; seats: number }) {
  const { t } = useI18n();
  const { user, status } = useAuth();
  const loc = useLocation();
  const qc = useQueryClient();
  const today = tashkentDateKey();
  const [day, setDay] = useState(date && date >= today ? date : today);
  const [seats, setSeats] = useState(initialSeats || 1);
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');

  const send = useMutation({
    mutationFn: () =>
      api.post<RideRequest>('/ride-requests', {
        fromCityId,
        toCityId,
        date: day,
        seats,
        ...(price ? { offeredPrice: Number(price) } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['rideRequests'] }),
  });

  if (send.isSuccess) {
    return (
      <div className="card ride-req ride-req-done" role="status">
        <span className="ride-req-icon ok">
          <IconCheck size={22} />
        </span>
        <div className="stack-sm" style={{ flex: 1 }}>
          <b className="ride-req-title">{t('rr.sentTitle')}</b>
          <p className="muted small" style={{ margin: 0 }}>
            {t('rr.sentHint')}
          </p>
          <Link to="/my-trips?tab=requests" className="btn btn-dark btn-sm" style={{ alignSelf: 'flex-start', marginTop: 6 }}>
            {t('rr.mine')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="card ride-req">
      <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
        <span className="ride-req-icon">
          <IconSend size={20} />
        </span>
        <div className="stack-sm" style={{ flex: 1 }}>
          <b className="ride-req-title">{t('rr.title')}</b>
          <p className="muted small" style={{ margin: 0 }}>
            {t('rr.hint')}
          </p>
        </div>
      </div>

      {status === 'guest' ? (
        <Link to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} className="btn btn-primary btn-lg btn-block">
          {t('rr.loginToSend')}
        </Link>
      ) : (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            send.mutate();
          }}
        >
          <div className="ride-req-grid">
            <Input label={t('common.date')} type="date" value={day} min={today} max={addDays(today, 30)} onChange={(e) => setDay(e.target.value)} required />
            <div className="field">
              <span className="field-label">{t('land.passengers')}</span>
              <Stepper value={seats} max={8} onChange={setSeats} label={t('common.people', { n: seats })} />
            </div>
            <Input
              label={t('rr.price')}
              inputMode="numeric"
              placeholder="150 000"
              value={price ? Number(price).toLocaleString('ru-RU') : ''}
              onChange={(e) => setPrice(e.target.value.replace(/\D/g, '').slice(0, 7))}
              hint={t('rr.priceHint')}
            />
          </div>
          <Textarea label={t('rr.note')} placeholder={t('rr.notePh')} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} />
          {send.isError ? <Alert kind="error">{errorText(send.error, t)}</Alert> : null}
          <Button type="submit" size="lg" block loading={send.isPending} disabled={!user}>
            <IconSend /> {t('rr.send')}
          </Button>
        </form>
      )}
    </div>
  );
}
