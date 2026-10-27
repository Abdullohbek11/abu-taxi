import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../lib/i18n';
import { Button, Input } from './ui';

export type LatLng = { lat: number; lng: number };

/** O'zbekiston chegaralari (backend validatsiyasi bilan bir xil) */
const UZ_BOUNDS = L.latLngBounds([37, 55.9], [45.7, 73.2]);
const UZ_CENTER: [number, number] = [41.3, 64.6];

const pinIcon = L.divIcon({
  className: 'map-pin',
  html: '<svg width="34" height="44" viewBox="0 0 34 44" aria-hidden="true"><path d="M17 43s15-14.6 15-26A15 15 0 0 0 2 17c0 11.4 15 26 15 26z" fill="#FFC300" stroke="#111" stroke-width="2"/><circle cx="17" cy="17" r="5.5" fill="#111"/></svg>',
  iconSize: [34, 44],
  iconAnchor: [17, 43],
});

const round = (v: number) => Math.round(v * 1e6) / 1e6;
const inUz = (p: LatLng) => UZ_BOUNDS.contains([p.lat, p.lng]);

/**
 * Xaritadan nuqta tanlash: bosish, markerni surish yoki "Mening joylashuvim" (GPS).
 * Xarita OpenStreetMap plitalari bilan; nuqta faqat O'zbekiston hududida qabul qilinadi.
 */
export function LocationPicker({ label, value, onChange, center }: { label: string; value: LatLng | null; onChange: (v: LatLng | null) => void; center?: [number, number] }) {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const change = useRef(onChange);
  change.current = onChange;
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');

  // Xaritani bir marta yaratish
  useEffect(() => {
    if (!box.current) return;
    const m = L.map(box.current, { maxBounds: UZ_BOUNDS.pad(0.2), minZoom: 5, attributionControl: true }).setView(center ?? UZ_CENTER, center ? 12 : 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => {
      const p = { lat: round(e.latlng.lat), lng: round(e.latlng.lng) };
      if (inUz(p)) change.current(p);
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hudud o'zgarsa (nuqta hali tanlanmagan bo'lsa) — xaritani o'sha hududga ko'chirish
  useEffect(() => {
    if (center && !value) map.current?.setView(center, 12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center?.[0], center?.[1]]);

  // Marker qiymatga ergashadi
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!value) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    if (!marker.current) {
      marker.current = L.marker([value.lat, value.lng], { icon: pinIcon, draggable: true }).addTo(m);
      marker.current.on('dragend', () => {
        const ll = marker.current!.getLatLng();
        const p = { lat: round(ll.lat), lng: round(ll.lng) };
        if (inUz(p)) change.current(p);
        else marker.current!.setLatLng([value.lat, value.lng]);
      });
    } else marker.current.setLatLng([value.lat, value.lng]);
  }, [value]);

  const locate = () => {
    if (!navigator.geolocation) {
      setError(t('loc.denied'));
      return;
    }
    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const p = { lat: round(pos.coords.latitude), lng: round(pos.coords.longitude) };
        if (!inUz(p)) {
          setError(t('loc.outside'));
          return;
        }
        onChange(p);
        map.current?.setView([p.lat, p.lng], 16);
      },
      () => {
        setLocating(false);
        setError(t('loc.denied'));
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div ref={box} className="map-box" />
      <div className="row-wrap" style={{ marginTop: 8, gap: 8 }}>
        <Button type="button" size="sm" variant="ghost" loading={locating} onClick={locate}>
          {t('loc.myLocation')}
        </Button>
        {value ? (
          <>
            <span className="small" style={{ color: 'var(--success)', fontWeight: 600 }}>
              ✓ {t('loc.selected')}
            </span>
            <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)}>
              {t('loc.clear')}
            </Button>
          </>
        ) : (
          <span className="small muted">{t('loc.hint')}</span>
        )}
      </div>
      {error ? <span className="field-error">{error}</span> : null}
    </div>
  );
}

/** Belgilangan nuqtani Yandex / Google xaritada ochish */
export function MapLinks({ lat, lng }: { lat: number | null | undefined; lng: number | null | undefined }) {
  const { t } = useI18n();
  if (lat == null || lng == null) return null;
  return (
    <span className="row-wrap" style={{ gap: 8 }}>
      <a className="btn btn-sm btn-ghost" href={`https://yandex.uz/maps/?pt=${lng},${lat}&z=17&l=map`} target="_blank" rel="noreferrer">
        {t('loc.yandex')}
      </a>
      <a className="btn btn-sm btn-ghost" href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`} target="_blank" rel="noreferrer">
        {t('loc.google')}
      </a>
    </span>
  );
}

/**
 * Manzil maydoni: matn (ko'cha, mo'ljal) + ixtiyoriy xaritadagi nuqta.
 * Xarita tugma bosilganda ochiladi (sahifa yengil qolishi uchun).
 */
export function PlaceField({
  label,
  address,
  onAddress,
  point,
  onPoint,
  center,
  required,
  error,
}: {
  label: string;
  address: string;
  onAddress: (v: string) => void;
  point: LatLng | null;
  onPoint: (v: LatLng | null) => void;
  center?: [number, number];
  required?: boolean;
  error?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(!!point);
  return (
    <div className="stack-sm">
      <Input label={label} value={address} onChange={(e) => onAddress(e.target.value)} placeholder={t('loc.addressPh')} maxLength={300} minLength={3} required={required} error={error} />
      {open ? (
        <LocationPicker label={t('loc.showMap')} value={point} onChange={onPoint} center={center} />
      ) : (
        <Button type="button" size="sm" variant="ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>
          📍 {t('loc.showMap')}
        </Button>
      )}
    </div>
  );
}
