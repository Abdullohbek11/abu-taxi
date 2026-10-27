import { useState, type ReactNode } from 'react';
import { cityName, dayLabel, money, tashkentDateKey } from '../lib/format';
import { useI18n } from '../lib/i18n';
import type { RideRequest } from '../lib/types';
import { IconCar } from './Icons';
import { ProfileView } from './ProfileSheet';
import { Modal, RouteLine, StatusBadge } from './ui';

/** Safar so'rovi kartasi: yo'nalish, sana, odam soni, taklif narxi va izoh. Pastki qismi — children. */
export function RideRequestCard({ r, badge, children }: { r: RideRequest; badge?: ReactNode; children?: ReactNode }) {
  const { t, lang } = useI18n();
  return (
    <div className="card stack ride-card" style={{ animation: 'abUp 400ms both' }}>
      <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <span className="muted small">
          {dayLabel(tashkentDateKey(new Date(r.date)), lang, t)} · {t('common.people', { n: r.seats })}
        </span>
        <div className="row" style={{ gap: 6 }}>
          {badge}
          <StatusBadge status={r.status} />
        </div>
      </div>
      <RouteLine from={cityName(r.from, lang)} to={cityName(r.to, lang)} />
      {r.offeredPrice || r.note ? (
        <div className="ride-card-meta small">
          {r.offeredPrice ? (
            <span>
              {t('rr.offered')}: <b className="num">{money(r.offeredPrice)} {t('common.som')}</b>
            </span>
          ) : null}
          {r.note ? <span className="muted">“{r.note}”</span> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

/** Yo'lovchiga: "Sizni falonchi olib ketadi" — haydovchi, mashina, narx. */
export function AssignedDriver({ a, profileId }: { a: NonNullable<RideRequest['assignment']>; profileId?: string | null }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const car = [a.carModel, a.carColor].filter(Boolean).join(', ');
  return (
    <div className="assigned">
      <span className="assigned-icon">
        <IconCar size={22} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="small muted">{t('rr.driverFound')}</div>
        {profileId ? (
          <button type="button" className="link-btn" onClick={() => setOpen(true)}>
            <b style={{ fontSize: 17 }}>{a.driverName}</b> <span className="small">· {t('prof.title')} ›</span>
          </button>
        ) : (
          <b style={{ fontSize: 17 }}>{a.driverName}</b>
        )}
        <div className="small">
          {car}
          {a.carPlate ? <span className="plate">{a.carPlate}</span> : null}
        </div>
      </div>
      {a.pricePerSeat ? (
        <div style={{ textAlign: 'right' }}>
          <b className="head-num" style={{ fontSize: 18 }}>
            {money(a.pricePerSeat)}
          </b>
          <div className="small muted">{t('rr.perPerson')}</div>
        </div>
      ) : null}
      {open && profileId ? (
        <Modal open onClose={() => setOpen(false)} title={t('prof.title')}>
          <ProfileView id={profileId} />
        </Modal>
      ) : null}
    </div>
  );
}
