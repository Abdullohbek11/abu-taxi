import { Link } from 'react-router-dom';
import { cityName, money, time } from '../lib/format';
import { useI18n } from '../lib/i18n';
import type { Trip } from '../lib/types';
import { IconHome, IconBox } from './Icons';
import { priceRange } from './SeatMap';
import { Avatar, Rating, StatusBadge } from './ui';

/** Qidiruv natijasi kartochkasi — dizayndagi xarita kartochkasi uslubida */
export function TripCard({ trip, to, extra, showStatus, delay = 0 }: { trip: Trip; to: string; extra?: React.ReactNode; showStatus?: boolean; delay?: number }) {
  const { t, lang } = useI18n();
  return (
    <Link to={to} className="trip-card" style={{ animationDelay: `${delay}ms` }}>
      <div className="trip-time">
        <b>{time(trip.departureAt)}</b>
        <span className="small faint">{t('trip.depart')}</span>
      </div>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, color: 'var(--ink)' }}>
            {cityName(trip.from, lang)} → {cityName(trip.to, lang)}
          </span>
          {showStatus ? <StatusBadge status={trip.status} /> : null}
        </div>
        <div className="row" style={{ gap: 10 }}>
          <Avatar name={trip.driver.name} url={trip.driver.avatarUrl} size={32} />
          <div style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{trip.driver.name}</span>
              <Rating value={trip.driver.rating} count={trip.driver.ratingCount} />
            </div>
            <div className="small muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {trip.vehicle.model}, {trip.vehicle.color.toLowerCase()} · {trip.vehicle.plateNumber}
            </div>
          </div>
        </div>
        <div className="row-wrap" style={{ gap: 6 }}>
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
          {extra}
        </div>
      </div>
      <div className="trip-price">
        <b>{priceRange(trip.seatPrices ?? [], trip.pricePerSeat).varies ? t('seat.from', { price: money(trip.pricePerSeat) }) : money(trip.pricePerSeat)}</b>
        <div className="small muted">{t('common.perSeat')}</div>
      </div>
    </Link>
  );
}
