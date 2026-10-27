import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { errorText } from '../lib/errors';
import { relativeTime } from '../lib/format';
import { useI18n } from '../lib/i18n';
import type { PublicProfile, PublicUser, RatingSummary } from '../lib/types';
import { Star } from './Icons';
import { Avatar, ErrorState, Modal, Segmented, Skeleton } from './ui';

/** Reyting: o'rtacha baho, yulduzlar va 5★…1★ taqsimoti (Play Market uslubida). */
function RatingBlock({ r, title }: { r: RatingSummary; title: string }) {
  const { t } = useI18n();
  const max = Math.max(...r.distribution.map((d) => d.count), 1);
  return (
    <div className="rating-block">
      <div className="rating-big">
        <span className="small muted">{title}</span>
        <b>{r.avg.toFixed(1)}</b>
        <span className="rating-stars" aria-hidden>
          {[1, 2, 3, 4, 5].map((n) => (
            <span key={n} style={{ opacity: n <= Math.round(r.avg) ? 1 : 0.2, display: 'inline-flex' }}>
              <Star size={14} />
            </span>
          ))}
        </span>
        <span className="small muted">{t('prof.reviewsCount', { n: r.count })}</span>
      </div>
      <div className="rating-bars" role="list">
        {r.distribution.map((d) => (
          <div key={d.stars} className="rating-bar" role="listitem" aria-label={`${d.stars}★: ${d.count}`}>
            <span className="small">{d.stars}</span>
            <span className="rating-track">
              <span style={{ width: `${(d.count / max) * 100}%` }} />
            </span>
            <span className="small muted num">{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProfileView({ id }: { id: string }) {
  const { t, lang } = useI18n();
  const q = useQuery({ queryKey: ['profile', id], queryFn: () => api.get<PublicProfile>(`/users/${id}/public`) });
  const p = q.data;
  const [tab, setTab] = useState<'DRIVER' | 'CLIENT'>('DRIVER');
  if (q.isPending) return <Skeleton height={120} count={2} />;
  if (q.isError || !p) return <ErrorState message={errorText(q.error, t)} onRetry={() => q.refetch()} />;

  const both = !!p.driverRating && !!p.clientRating;
  const role = both ? tab : p.driverRating ? 'DRIVER' : 'CLIENT';
  const rating = role === 'DRIVER' ? p.driverRating : p.clientRating;
  const reviews = p.reviews.filter((r) => !r.role || r.role === role);
  const vehicle = p.driver?.vehicles[0];
  const since = new Date(p.memberSince).getFullYear();

  return (
    <div className="stack">
      <div className="row" style={{ gap: 14 }}>
        <Avatar name={p.name} url={p.avatarUrl} size={64} />
        <div style={{ minWidth: 0 }}>
          <b style={{ fontSize: 20, fontFamily: 'var(--font-head)' }}>{p.name}</b>
          <div className="small muted">
            {p.driver ? t('prof.driver') : t('prof.client')} · {t('prof.since', { year: since })}
          </div>
          {p.driverRating || p.driver ? <span className="badge badge-green" style={{ marginTop: 6 }}>✓ {t('prof.verified')}</span> : null}
        </div>
      </div>

      <div className="stat-strip">
        {p.driver ? (
          <div>
            <b className="num">{p.driver.tripsCount}</b>
            <span>{t('prof.trips')}</span>
          </div>
        ) : (
          <div>
            <b className="num">{p.passenger.completedTrips}</b>
            <span>{t('prof.trips')}</span>
          </div>
        )}
        <div>
          <b className="num">{rating ? rating.avg.toFixed(1) : '—'}</b>
          <span>{t('prof.rating')}</span>
        </div>
        <div>
          <b className="num" style={{ color: p.passenger.lateCancellations ? 'var(--warning)' : undefined }}>{p.passenger.lateCancellations}</b>
          <span>{t('prof.lateCancels')}</span>
        </div>
      </div>

      {vehicle ? (
        <div className="assigned" style={{ padding: 12 }}>
          <div style={{ flex: 1 }}>
            <div className="small muted">{t('prof.car')}</div>
            <b>
              {vehicle.model}, {vehicle.color}
            </b>
            <span className="plate">{vehicle.plateNumber}</span>
          </div>
          <span className="small muted">{t('common.people', { n: vehicle.seats })}</span>
        </div>
      ) : null}

      {both ? (
        <Segmented<'DRIVER' | 'CLIENT'>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'DRIVER', label: t('prof.asDriver') },
            { value: 'CLIENT', label: t('prof.asClient') },
          ]}
        />
      ) : null}
      {rating ? <RatingBlock r={rating} title={role === 'DRIVER' ? t('prof.asDriver') : t('prof.asClient')} /> : <p className="muted small">{t('prof.noRating')}</p>}

      {reviews.length ? (
        <div className="stack-sm">
          {reviews.map((r) => (
            <div key={r.id} className="review-item">
              <div className="row between">
                <span className="small" style={{ fontWeight: 600 }}>
                  {r.author.name}
                </span>
                <span className="stars small">
                  <Star size={13} />
                  {r.rating}
                </span>
              </div>
              {r.text ? <p style={{ margin: '4px 0 0' }}>{r.text}</p> : null}
              <span className="small faint">{relativeTime(r.createdAt, lang)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Ism (avatar + reyting) — bosilganda profil pastdan chiqadi.
 * Haydovchi yo'lovchini, yo'lovchi haydovchini olishdan oldin kimligini ko'radi.
 */
export function UserChip({ user, rating, size = 40, sub, children }: { user: Pick<PublicUser, 'id' | 'name' | 'avatarUrl'>; rating?: { avg: number; count: number } | null; size?: number; sub?: ReactNode; children?: ReactNode }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="user-chip" onClick={() => setOpen(true)} aria-label={t('prof.open', { name: user.name })}>
        <Avatar name={user.name} url={user.avatarUrl} size={size} />
        <span style={{ minWidth: 0, textAlign: 'left' }}>
          <span className="user-chip-name">
            {user.name}
            {rating === undefined ? null : rating && rating.count ? (
              <span className="stars small">
                <Star size={12} />
                {rating.avg.toFixed(1)}
                <span className="faint">({rating.count})</span>
              </span>
            ) : (
              <span className="badge" style={{ height: 20 }}>
                {t('prof.new')}
              </span>
            )}
          </span>
          {sub ? <span className="small muted" style={{ display: 'block' }}>{sub}</span> : null}
          {children}
        </span>
      </button>
      {open ? (
        <Modal open onClose={() => setOpen(false)} title={t('prof.title')}>
          <ProfileView id={user.id} />
        </Modal>
      ) : null}
    </>
  );
}
