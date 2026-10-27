import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  IconArrowRight,
  IconBox,
  IconCalendar,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconHome,
  IconMinus,
  IconPhone,
  IconPlus,
  IconSearch,
  IconShield,
  IconSwap,
  IconUser,
  IconUsers,
  IconWallet,
  IconWeight,
  PinIcon,
  Star,
} from '../components/Icons';
import { api } from '../lib/api';
import { addDays, cityName, dayLabel, money, monthName, regionName, tashkentDateKey } from '../lib/format';
import type { Lang } from '../lib/i18n';
import { useI18n } from '../lib/i18n';
import { regionOptions, useCities, type RegionOption } from '../lib/queries';
import type { Review } from '../lib/types';
import type { MessageKey } from '../locales/uz';

const EASE = 'cubic-bezier(.22,1,.36,1)';
const up = (delay: number) => ({ animation: `abUp 700ms ${EASE} both`, animationDelay: `${delay}ms` });

/** Ekranga chiqqanda paydo bo'lish (dizayndagi data-reveal) */
function Reveal({ delay = 0, children, style }: { delay?: number; children: ReactNode; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return setShown(true);
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && (setShown(true), io.disconnect()), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{ ...style, opacity: shown ? 1 : 0, transform: shown ? 'none' : 'translateY(24px)', transition: `opacity 600ms ${EASE} ${delay}ms, transform 600ms ${EASE} ${delay}ms` }}
    >
      {children}
    </div>
  );
}

/** Raqam animatsiyasi (dizayndagi countUp) */
function useCountUp(target: number, start: boolean) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!start) return;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 1000);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, start]);
  return v;
}

const card: React.CSSProperties = { height: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 12 };
const sectionTitle: React.CSSProperties = { fontWeight: 700, fontSize: 'clamp(24px,3.2vw,32px)', lineHeight: 1.25, textWrap: 'balance' } as React.CSSProperties;
const fieldBox: React.CSSProperties = { position: 'relative', display: 'block', background: 'var(--bg-alt)', borderRadius: 12, padding: '8px 16px', height: 56, overflow: 'hidden' };
const fieldLabel: React.CSSProperties = { display: 'block', fontSize: 12, lineHeight: '16px', color: 'var(--text-3)', fontWeight: 500 };

/** Dizayndagi maydon ustida shaffof native select — mobilda tizim ro'yxati ochiladi */
function CityOverlay({ selectRef, label, value, onChange, regions, lang }: { selectRef: React.Ref<HTMLSelectElement>; label: string; value: string; onChange: (id: string) => void; regions: RegionOption[]; lang: Lang }) {
  return (
    <select ref={selectRef} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} style={{ position: 'absolute', inset: 0, width: '100%', opacity: 0, cursor: 'pointer', fontSize: 16 }}>
      <option value="" disabled>
        —
      </option>
      {regions.map((r) => (
        <option key={r.center.id} value={r.center.id}>
          {regionName(r.region, lang)}
        </option>
      ))}
    </select>
  );
}

function SearchCard() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { data: cities } = useCities();
  const [tab, setTab] = useState<'pass' | 'cargo'>('pass');
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [anim, setAnim] = useState({ rot: 0, y: 0, swapping: false });
  const [date, setDate] = useState(() => addDays(tashkentDateKey(), 1));
  const [seats, setSeats] = useState(1);
  const [kg, setKg] = useState('');
  const dateRef = useRef<HTMLInputElement>(null);

  const fromRef = useRef<HTMLSelectElement>(null);
  const toRef = useRef<HTMLSelectElement>(null);
  const from = cities?.find((c) => c.id === fromId);
  const to = cities?.find((c) => c.id === toId);
  const regions = regionOptions(cities);

  const swap = () => {
    if (anim.swapping) return;
    setAnim((a) => ({ rot: a.rot + 180, y: 64, swapping: true }));
    setTimeout(() => {
      setFromId(toId);
      setToId(fromId);
      setAnim((a) => ({ ...a, y: 0, swapping: false }));
    }, 300);
  };

  const submit = () => {
    if (tab === 'cargo') {
      const q = new URLSearchParams({ ...(from ? { from: from.id } : {}), ...(to ? { to: to.id } : {}), date, ...(kg ? { kg } : {}) });
      navigate(`/cargo/new?${q}`);
      return;
    }
    if (!from || !to) {
      const ref = !from ? fromRef : toRef;
      ref.current?.focus();
      try {
        ref.current?.showPicker?.();
      } catch {
        // showPicker ba'zi brauzerlarda select uchun yo'q
      }
      return;
    }
    navigate(`/search?${new URLSearchParams({ from: from.id, to: to.id, date, seats: String(seats) })}`);
  };

  const isPass = tab === 'pass';
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 28, boxShadow: 'var(--sh-lg)', border: '1px solid var(--border)', padding: 'clamp(16px,2.4vw,24px)', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 520, ...up(440) }}>
      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr', background: 'var(--bg-alt)', borderRadius: 999, padding: 4 }}>
        <span style={{ position: 'absolute', top: 4, bottom: 4, left: 4, width: 'calc(50% - 4px)', borderRadius: 999, background: 'var(--primary)', transform: isPass ? 'translateX(0)' : 'translateX(100%)', transition: `transform 250ms ${EASE}` }} />
        {(['pass', 'cargo'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            aria-pressed={tab === k}
            style={{ position: 'relative', border: 0, background: 'transparent', cursor: 'pointer', height: 44, borderRadius: 999, font: '600 15px Inter,sans-serif', color: tab === k ? '#111' : 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'color 250ms' }}
          >
            {k === 'pass' ? <IconUsers size={18} /> : <IconBox size={18} />}
            {k === 'pass' ? t('land.tabPass') : t('land.tabCargo')}
          </button>
        ))}
      </div>

      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '28px 1fr 48px', gap: 8, alignItems: 'center' }}>
        <div style={{ gridRow: '1 / span 2', alignSelf: 'stretch', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '22px 0' }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', border: '3px solid var(--ink)', flexShrink: 0 }} />
          <span style={{ flex: 1, width: 0, borderLeft: '2px dotted var(--text-3)', margin: '4px 0' }} />
          <PinIcon />
        </div>
        <div style={fieldBox}>
          <span style={fieldLabel}>{t('common.from')}</span>
          <span style={{ display: 'block', fontWeight: 600, transform: `translateY(${anim.y}px)`, color: from ? 'var(--ink)' : 'var(--text-3)', opacity: anim.swapping ? 0.4 : 1, transition: anim.swapping ? `transform 300ms ${EASE}, opacity 300ms` : 'none' }}>{from ? regionName(from.region, lang) : t('land.pickCity')}</span>
          <CityOverlay selectRef={fromRef} label={t('common.from')} value={fromId} onChange={setFromId} regions={regions} lang={lang} />
        </div>
        <button
          onClick={swap}
          aria-label={t('land.swap')}
          style={{ gridRow: '1 / span 2', gridColumn: 3, width: 44, height: 44, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', cursor: 'pointer', display: 'grid', placeItems: 'center', boxShadow: 'var(--sh-sm)', transform: `rotate(${anim.rot}deg)`, transition: `transform 300ms ${EASE}` }}
        >
          <IconSwap />
        </button>
        <div style={{ ...fieldBox, gridColumn: 2 }}>
          <span style={fieldLabel}>{t('common.to')}</span>
          <span style={{ display: 'block', fontWeight: 600, transform: `translateY(${-anim.y}px)`, color: to ? 'var(--ink)' : 'var(--text-3)', opacity: anim.swapping ? 0.4 : 1, transition: anim.swapping ? `transform 300ms ${EASE}, opacity 300ms` : 'none' }}>{to ? regionName(to.region, lang) : t('land.pickCity')}</span>
          <CityOverlay selectRef={toRef} label={t('common.to')} value={toId} onChange={setToId} regions={regions} lang={lang} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,180px),1fr))', gap: 8 }}>
        <label style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-alt)', borderRadius: 12, padding: '0 16px', height: 56, color: 'var(--text-2)', cursor: 'pointer' }} onClick={() => dateRef.current?.showPicker?.()}>
          <IconCalendar />
          <span style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={fieldLabel}>{t('common.date')}</span>
            <span style={{ fontWeight: 600, color: 'var(--ink)', lineHeight: '20px' }}>{dayLabel(date, lang, t)}</span>
          </span>
          <input
            ref={dateRef}
            type="date"
            value={date}
            min={tashkentDateKey()}
            max={addDays(tashkentDateKey(), 30)}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            aria-label={t('common.date')}
            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
          />
        </label>
        {isPass ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-alt)', borderRadius: 12, padding: '0 8px 0 16px', height: 56, color: 'var(--text-2)' }}>
            <IconUser />
            <span style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <span style={fieldLabel}>{t('land.passengers')}</span>
              <span className="num" style={{ fontWeight: 600, color: 'var(--ink)', lineHeight: '20px' }}>{t('common.people', { n: seats })}</span>
            </span>
            {[
              ['-', IconMinus, () => setSeats((s) => Math.max(1, s - 1)), seats <= 1],
              ['+', IconPlus, () => setSeats((s) => Math.min(4, s + 1)), seats >= 4],
            ].map(([k, Icon, fn, off]) => {
              const I = Icon as typeof IconMinus;
              return (
                <button key={k as string} onClick={fn as () => void} aria-label={k as string} style={{ width: 36, height: 36, borderRadius: '50%', border: 0, background: 'var(--surface)', color: 'var(--ink)', cursor: 'pointer', display: 'grid', placeItems: 'center', opacity: off ? 0.4 : 1, boxShadow: 'var(--sh-sm)' }}>
                  <I />
                </button>
              );
            })}
          </div>
        ) : (
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-alt)', borderRadius: 12, padding: '0 16px', height: 56, color: 'var(--text-2)', animation: 'abFade 250ms both' }}>
            <IconWeight />
            <span style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
              <span style={fieldLabel}>{t('land.weight')}</span>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <input value={kg} onChange={(e) => setKg(e.target.value.replace(/\D/g, '').slice(0, 5))} inputMode="numeric" placeholder="120" style={{ border: 0, background: 'transparent', outline: 'none', padding: 0, width: '100%', minWidth: 0, font: '600 16px/20px Inter,sans-serif', color: 'var(--ink)' }} />
                <span style={{ fontWeight: 600, color: 'var(--text-2)' }}>kg</span>
              </span>
            </span>
          </label>
        )}
      </div>

      <button className="btn btn-primary btn-lg btn-block" onClick={submit} disabled={isPass && (!from || !to)}>
        <IconSearch />
        {isPass ? t('land.searchPass') : t('land.searchCargo')}
      </button>
    </div>
  );
}

function MapIllustration() {
  const { t } = useI18n();
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return (
    <div style={{ position: 'relative', minWidth: 0, borderRadius: 28, overflow: 'hidden', background: 'var(--bg-alt)', aspectRatio: '1 / 1.02', maxHeight: 640, border: '1px solid var(--border)', animation: 'abFade 800ms both', animationDelay: '100ms' }}>
      <svg viewBox="0 0 560 572" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', left: -7, top: -75 }} aria-hidden="true">
        <defs>
          <pattern id="abgrid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M28 0H0V28" fill="none" stroke="var(--border)" strokeWidth="1" />
          </pattern>
          <path id="abroute" d="M470 404 C 430 392, 408 360, 372 352 S 318 318, 292 300 S 250 262, 214 262 S 150 220, 120 170" />
        </defs>
        <rect width="560" height="572" fill="url(#abgrid)" opacity=".7" />
        <path d="M-20 470 C 120 430, 260 470, 580 390" fill="none" stroke="var(--road)" strokeWidth="18" />
        <path d="M40 -20 C 80 120, 60 300, 150 600" fill="none" stroke="var(--road)" strokeWidth="14" />
        <path d="M600 120 C 460 150, 380 90, 260 60 S 60 70, -20 40" fill="none" stroke="var(--road)" strokeWidth="12" />
        <path d="M520 -20 C 500 160, 540 300, 480 600" fill="none" stroke="var(--road)" strokeWidth="10" />
        <rect x="300" y="420" width="120" height="70" rx="14" fill="var(--block-land)" />
        <rect x="170" y="330" width="90" height="60" rx="14" fill="var(--block-land)" />
        <rect x="330" y="160" width="130" height="80" rx="14" fill="var(--block-land)" />
        <path d="M470 404 C 430 392, 408 360, 372 352 S 318 318, 292 300 S 250 262, 214 262 S 150 220, 120 170" fill="none" stroke="var(--ink)" strokeWidth="6" strokeLinecap="round" pathLength={1} strokeDasharray="1" style={{ animation: `abDraw 1.2s ${EASE} both`, animationDelay: '300ms' }} />
        <path d="M470 404 C 430 392, 408 360, 372 352 S 318 318, 292 300 S 250 262, 214 262 S 150 220, 120 170" fill="none" stroke="var(--bg-alt)" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 10" style={{ animation: 'abFade 400ms both', animationDelay: '1400ms' }} />
        {!reduced ? (
          <g style={{ animation: 'abFade 400ms both', animationDelay: '1500ms' }}>
            <g>
              <animateMotion dur="6s" repeatCount="indefinite" rotate="auto-reverse" begin="1.5s">
                <mpath href="#abroute" />
              </animateMotion>
              <rect x="-15" y="-9" width="30" height="18" rx="6" fill="#FFC300" stroke="#111" strokeWidth="2" />
              <rect x="-6" y="-6" width="9" height="12" rx="2" fill="#111" />
              <rect x="7" y="-5" width="4" height="10" rx="1.5" fill="#111" opacity=".55" />
            </g>
          </g>
        ) : null}
        <circle cx="120" cy="170" r="10" fill="#FFC300" style={{ transformOrigin: '120px 170px', animation: 'abPulse 1.8s ease-out infinite' }} />
        <circle cx="470" cy="404" r="9" fill="var(--ink)" />
        <circle cx="470" cy="404" r="4" fill="var(--bg-alt)" />
        <path d="M120 176 c 0 0 -14 -12 -14 -22 a14 14 0 0 1 28 0 c 0 10 -14 22 -14 22z" fill="#FFC300" stroke="#111" strokeWidth="2" transform="translate(0 -10)" />
        <circle cx="120" cy="144" r="4.5" fill="#111" />
      </svg>
      <div style={{ position: 'absolute', left: '6%', top: '36%', display: 'flex', flexDirection: 'column', background: 'var(--surface)', borderRadius: 12, padding: '8px 12px', boxShadow: 'var(--sh-md)', animation: 'abUp 600ms both', animationDelay: '1200ms' }}>
        <span style={{ fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: 15, color: 'var(--ink)' }}>{t('land.mapTo')}</span>
        <span style={{ fontSize: 12, lineHeight: '16px', color: 'var(--text-2)' }}>{t('land.mapArrive')}</span>
      </div>
      <div style={{ position: 'absolute', right: '6%', top: '60%', display: 'flex', flexDirection: 'column', background: 'var(--ink)', color: 'var(--on-ink)', borderRadius: 12, padding: '8px 12px', boxShadow: 'var(--sh-md)', animation: 'abUp 600ms both', animationDelay: '900ms' }}>
        <span style={{ fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: 15 }}>{t('land.mapFrom')}</span>
        <span style={{ fontSize: 12, lineHeight: '16px', opacity: 0.7 }}>{t('land.mapDepart')}</span>
      </div>
      <div style={{ position: 'absolute', left: '4%', right: '4%', bottom: '4%', background: 'var(--surface)', borderRadius: 20, boxShadow: 'var(--sh-lg)', padding: 16, display: 'flex', alignItems: 'center', gap: 12, ...up(1700) }}>
        <span className="avatar" style={{ width: 48, height: 48 }}>BA</span>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: 'var(--ink)' }}>
            Bahodir A.
            <span className="stars">
              <Star />
              4.9
            </span>
          </span>
          <span style={{ fontSize: 13, lineHeight: '18px', color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t('land.mapCar')}</span>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div className="head-num" style={{ fontSize: 18 }}>150 000</div>
          <div style={{ fontSize: 12, lineHeight: '16px', color: 'var(--text-2)' }}>{t('common.perSeat')}</div>
        </div>
      </div>
    </div>
  );
}

function Trust() {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const { data } = useQuery({ queryKey: ['stats-public'], queryFn: () => api.get<{ trips: number; drivers: number; rating: number | null }>('/stats/public'), staleTime: 300_000 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && (setVisible(true), io.disconnect()), { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [data]);
  const trips = useCountUp(data?.trips ?? 0, visible);
  const drivers = useCountUp(data?.drivers ?? 0, visible);
  const rating = useCountUp(data?.rating ?? 0, visible);
  // Soxta raqam ko'rsatilmaydi: ma'lumot bo'lmasa blok yo'q
  if (!data || (data.trips === 0 && data.drivers === 0)) return null;
  const cell = (first: boolean): React.CSSProperties => ({
    padding: first ? 'clamp(20px,3vw,32px) 0' : 'clamp(20px,3vw,32px) 0 clamp(20px,3vw,32px) clamp(12px,3vw,32px)',
    borderLeft: first ? 0 : '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  });
  const big: React.CSSProperties = { fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 'clamp(26px,4vw,40px)', lineHeight: 1.2, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums', display: 'flex', alignItems: 'center', gap: 6 };
  return (
    <section ref={ref} className="container">
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${data.rating ? 3 : 2},minmax(0,1fr))`, borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div style={cell(true)}>
          <span style={big}>{money(trips)}</span>
          <span style={{ fontSize: 14, color: 'var(--text-2)' }}>{t('land.statTrips')}</span>
        </div>
        <div style={cell(false)}>
          <span style={big}>{money(drivers)}</span>
          <span style={{ fontSize: 14, color: 'var(--text-2)' }}>{t('land.statDrivers')}</span>
        </div>
        {data.rating ? (
          <div style={cell(false)}>
            <span style={big}>
              {rating.toFixed(1)}
              <Star size={26} />
            </span>
            <span style={{ fontSize: 14, color: 'var(--text-2)' }}>{t('land.statRating')}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Reviews() {
  const { t, lang } = useI18n();
  const carRef = useRef<HTMLDivElement>(null);
  const { data } = useQuery({ queryKey: ['reviews-recent'], queryFn: () => api.get<Review[]>('/reviews/recent', { limit: 8 }), staleTime: 300_000 });
  if (!data?.length) return null;
  const scroll = (dir: number) => {
    const el = carRef.current;
    const w = (el?.firstElementChild?.getBoundingClientRect().width ?? 320) + 16;
    el?.scrollBy({ left: dir * w, behavior: 'smooth' });
  };
  const month = (iso: string) => monthName(new Date(iso).getMonth(), lang);
  return (
    <section className="container" style={{ paddingTop: 'clamp(64px,8vw,96px)', display: 'flex', flexDirection: 'column', gap: 'clamp(24px,4vw,40px)' }}>
      <Reveal style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div className="stack-sm" style={{ gap: 12 }}>
          <span className="eyebrow">{t('land.reviewsEyebrow')}</span>
          <h2 style={sectionTitle}>{t('land.reviewsTitle')}</h2>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button onClick={() => scroll(-1)} aria-label="←" style={{ width: 48, height: 48, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
            <IconChevronLeft />
          </button>
          <button onClick={() => scroll(1)} aria-label="→" style={{ width: 48, height: 48, borderRadius: '50%', border: 0, background: 'var(--ink)', color: 'var(--on-ink)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
            <IconChevronRight />
          </button>
        </div>
      </Reveal>
      <div ref={carRef} style={{ display: 'flex', gap: 16, overflowX: 'auto', scrollSnapType: 'x mandatory', scrollBehavior: 'smooth', scrollbarWidth: 'none', margin: '0 calc(-1 * var(--gutter))', padding: '4px var(--gutter) 24px' }}>
        {data.map((r) => (
          <div key={r.id} style={{ flex: '0 0 min(360px,84%)', scrollSnapAlign: 'start', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="row" style={{ gap: 2 }}>
              {Array.from({ length: r.rating }, (_, i) => (
                <Star key={i} size={16} />
              ))}
            </div>
            <p style={{ margin: 0, flex: 1, color: 'var(--text)' }}>{r.text}</p>
            <div className="row">
              <span className="avatar" style={{ width: 44, height: 44, background: 'var(--bg-alt)', color: 'var(--ink)', fontWeight: 600, fontSize: 15 }}>
                {r.author.name.split(' ').map((p) => p[0]).join('').slice(0, 2)}
              </span>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{r.author.name}</div>
                <div className="small muted">
                  {r.route ? `${cityName(r.route.from, lang)} → ${cityName(r.route.to, lang)} · ` : ''}
                  {month(r.createdAt)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Faq() {
  const { t } = useI18n();
  const [open, setOpen] = useState(0);
  const items = [1, 2, 3, 4, 5].map((i) => [t(`land.faq${i}q` as MessageKey), t(`land.faq${i}a` as MessageKey)] as const);
  return (
    <section className="container" style={{ padding: 'clamp(48px,6vw,72px) var(--gutter) clamp(64px,8vw,96px)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,360px),1fr))', gap: 'clamp(24px,4vw,64px)', alignItems: 'start' }}>
      <Reveal style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span className="eyebrow">{t('land.faqEyebrow')}</span>
        <h2 style={sectionTitle}>{t('land.faqTitle')}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {t('land.faqLead')}{' '}
          <a href="https://t.me/abutax_uz" target="_blank" rel="noreferrer" style={{ color: 'var(--ink)', fontWeight: 600, textDecoration: 'underline', textDecorationColor: '#FFC300', textDecorationThickness: 2, textUnderlineOffset: 3 }}>
            @abutax_uz
          </a>
        </p>
      </Reveal>
      <div className="stack-sm">
        {items.map(([q, a], i) => {
          const isOpen = open === i;
          return (
            <div key={i} style={{ background: isOpen ? 'var(--bg-alt)' : 'transparent', borderRadius: 20, transition: 'background 250ms' }}>
              <button onClick={() => setOpen(isOpen ? -1 : i)} aria-expanded={isOpen} style={{ width: '100%', border: 0, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16, padding: '20px 20px 20px 24px', textAlign: 'left', font: '600 17px/26px Poppins,sans-serif', color: 'var(--ink)' }}>
                <span style={{ flex: 1 }}>{q}</span>
                <span style={{ width: 36, height: 36, borderRadius: '50%', background: isOpen ? '#FFC300' : 'var(--primary-soft)', color: '#111', display: 'grid', placeItems: 'center', flexShrink: 0, transform: `rotate(${isOpen ? 45 : 0}deg)`, transition: `transform 250ms ${EASE}, background 250ms` }}>
                  <IconPlus size={18} />
                </span>
              </button>
              <div style={{ display: 'grid', gridTemplateRows: isOpen ? '1fr' : '0fr', transition: `grid-template-rows 300ms ${EASE}` }}>
                <div style={{ overflow: 'hidden' }}>
                  <p style={{ margin: 0, padding: '0 72px 20px 24px', color: 'var(--text-2)' }}>{a}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function Landing() {
  const { t, lang } = useI18n();
  const benefits = [
    [IconPhone, 'land.why1t', 'land.why1d'],
    [IconWallet, 'land.why2t', 'land.why2d'],
    [IconShield, 'land.why3t', 'land.why3d'],
    [IconHome, 'land.why4t', 'land.why4d'],
  ] as const;
  const chips: MessageKey[] = ['cargo.FURNITURE', 'cargo.APPLIANCE', 'cargo.FOOD', 'cargo.CONSTRUCTION', 'cargo.OTHER'];

  return (
    <>
      {/* HERO */}
      <section id="top" className="container" style={{ paddingTop: 'clamp(24px,5vw,56px)', paddingBottom: 'clamp(48px,6vw,80px)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,460px),1fr))', gap: 'clamp(32px,5vw,56px)', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 }}>
          <span style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 8, height: 32, padding: '0 14px', borderRadius: 999, background: 'var(--primary-soft)', color: 'var(--soft-ink)', fontSize: 13, fontWeight: 600, animation: 'abFade 400ms both' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)' }} />
            {t('land.badge')}
          </span>
          <h1 style={{ fontWeight: 700, fontSize: 'clamp(36px,5vw,56px)', lineHeight: 1.14, letterSpacing: -1, textWrap: 'balance' } as React.CSSProperties}>
            <span style={{ display: 'inline-block', ...up(0) }}>{t('land.h1a')}</span>{' '}
            <span style={{ display: 'inline-block', ...up(120) }}>{t('land.h1b')}</span>
            <br />
            <span style={{ display: 'inline-block', ...up(180), background: 'linear-gradient(transparent 58%,var(--primary) 58%,var(--primary) 92%,transparent 92%)', padding: '0 4px', marginLeft: -4 }}>{t('land.h1c')}</span>
          </h1>
          <p style={{ margin: 0, fontSize: 18, lineHeight: '28px', color: 'var(--text-2)', maxWidth: 500, ...up(240) }}>{t('land.lead')}</p>
          <SearchCard />
        </div>
        <MapIllustration />
      </section>

      <Trust />

      {/* HOW */}
      <section id="qanday" className="container" style={{ paddingTop: 'clamp(64px,8vw,96px)', display: 'flex', flexDirection: 'column', gap: 'clamp(24px,4vw,48px)' }}>
        <Reveal style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 620 }}>
          <span className="eyebrow">{t('land.howEyebrow')}</span>
          <h2 style={sectionTitle}>{t('land.howTitle')}</h2>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))', gap: 16 }}>
          {[1, 2, 3].map((i) => (
            <Reveal key={i} delay={(i - 1) * 80}>
              <div className="card-hover" style={card}>
                <span style={{ width: 48, height: 48, borderRadius: 999, background: 'var(--primary)', color: '#111', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 18 }}>{i}</span>
                <h3 style={{ margin: '8px 0 0', fontWeight: 600, fontSize: 22, lineHeight: '30px' }}>{t(`land.how${i}t` as MessageKey)}</h3>
                <p style={{ margin: 0, color: 'var(--text-2)' }}>{t(`land.how${i}d` as MessageKey)}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* BENEFITS */}
      <section className="container" style={{ paddingTop: 'clamp(64px,8vw,96px)' }}>
        <div style={{ background: 'var(--bg-alt)', borderRadius: 28, padding: 'clamp(24px,5vw,56px)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,420px),1fr))', gap: 'clamp(24px,4vw,48px)', alignItems: 'start' }}>
          <Reveal style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span className="eyebrow">{t('land.whyEyebrow')}</span>
            <h2 style={sectionTitle}>{t('land.whyTitle')}</h2>
            <p style={{ margin: 0, fontSize: 18, lineHeight: '28px', color: 'var(--text-2)' }}>{t('land.whyLead')}</p>
          </Reveal>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,220px),1fr))', gap: 12 }}>
            {benefits.map(([Icon, title, desc], i) => (
              <Reveal key={title} delay={i * 80}>
                <div style={{ ...card, border: 0, padding: 20 }}>
                  <span className="icon-tile">
                    <Icon size={22} />
                  </span>
                  <h4 style={{ fontWeight: 600, fontSize: 18, lineHeight: '26px' }}>{t(title)}</h4>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: '20px', color: 'var(--text-2)' }}>{t(desc)}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CARGO */}
      <section id="yuk" className="container" style={{ paddingTop: 'clamp(64px,8vw,96px)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,420px),1fr))', gap: 'clamp(32px,5vw,64px)', alignItems: 'center' }}>
        <Reveal style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <span className="badge badge-yellow" style={{ alignSelf: 'flex-start', height: 28, letterSpacing: '.06em', textTransform: 'uppercase' }}>
            {t('land.cargoBadge')}
          </span>
          <h2 style={sectionTitle}>{t('land.cargoTitle')}</h2>
          <p style={{ margin: 0, fontSize: 18, lineHeight: '28px', color: 'var(--text-2)' }}>{t('land.cargoLead')}</p>
          <div className="row-wrap">
            {chips.map((c) => (
              <span key={c} style={{ height: 36, padding: '0 16px', borderRadius: 999, background: 'var(--bg-alt)', display: 'inline-flex', alignItems: 'center', fontSize: 14, fontWeight: 500 }}>
                {t(c)}
              </span>
            ))}
          </div>
          <Link to="/cargo/new" className="btn btn-outline" style={{ alignSelf: 'flex-start', marginTop: 8, height: 52, padding: '0 28px', fontSize: 16 }}>
            {t('land.cargoBtn')}
            <IconArrowRight />
          </Link>
        </Reveal>
        <Reveal delay={120} style={{ position: 'relative', padding: 'clamp(16px,4vw,40px)', background: 'var(--bg-alt)', borderRadius: 28 }}>
          <div className="card-hover" style={{ background: 'var(--surface)', borderRadius: 20, boxShadow: 'var(--sh-md)', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="row">
              <span className="avatar" style={{ width: 56, height: 56, fontSize: 18 }}>SR</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ gap: 6, fontWeight: 600, color: 'var(--ink)' }}>
                  Sardor R.
                  <span className="stars">
                    <Star />
                    4.8 · 212 {t('common.trips')}
                  </span>
                </div>
                <div className="small muted">Labo · 60 L 4**</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="small faint">{t('land.cargoDepart')}</div>
                <div className="head-num" style={{ fontSize: 22, lineHeight: '28px' }}>14:00</div>
              </div>
            </div>
            <div className="row-wrap" style={{ gap: 6 }}>
              <span className="badge badge-green">
                <IconCheck />
                {t('land.cargoVerified')}
              </span>
              <span className="badge badge-yellow">{t('land.cargoTakes')}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
              {[
                [t('land.cargoCap'), '800 kg'],
                [t('land.cargoBody'), '2.2 × 1.4 m'],
                [t('land.cargoFree'), '~60%'],
              ].map(([k, v]) => (
                <div key={k} style={{ background: 'var(--bg-alt)', borderRadius: 12, padding: '10px 12px' }}>
                  <div className="small faint">{k}</div>
                  <div className="num" style={{ fontWeight: 600, color: 'var(--ink)' }}>{v}</div>
                </div>
              ))}
            </div>
            <div className="row between" style={{ paddingTop: 4, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <div style={{ paddingTop: 12 }}>
                <div className="small faint">{t('land.cargoRoute')}</div>
                <div className="head-num" style={{ fontSize: 22, lineHeight: '30px' }}>
                  350 000 {t('common.som')}
                  <span style={{ fontFamily: 'var(--font)', fontWeight: 500, fontSize: 14, color: 'var(--text-2)' }}>{t('land.cargoFrom')}</span>
                </div>
              </div>
              <Link to="/cargo/new" className="btn btn-primary" style={{ marginTop: 12 }}>
                {t('land.cargoOffer')}
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      {/* DRIVER CTA */}
      <section id="haydovchi" style={{ maxWidth: 1248, margin: '0 auto', padding: 'clamp(64px,8vw,96px) clamp(0px,2vw,24px) 0' }}>
        <Reveal>
          <div style={{ background: 'var(--block)', color: '#FFF', borderRadius: 'clamp(0px,2.4vw,28px)', padding: 'clamp(40px,6vw,72px) clamp(16px,5vw,64px)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,420px),1fr))', gap: 'clamp(32px,5vw,56px)', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <h2 style={{ fontWeight: 700, fontSize: 'clamp(30px,4vw,40px)', lineHeight: 1.2, letterSpacing: -0.5, color: '#fff' }}>
                {t('land.driverTitleA')} <span style={{ color: '#FFC300' }}>{t('land.driverTitleB')}</span>
              </h2>
              <p style={{ margin: 0, fontSize: 18, lineHeight: '28px', color: '#A3A3A3', maxWidth: 480 }}>{t('land.driverLead')}</p>
              <div className="row-wrap" style={{ gap: 12, marginTop: 4 }}>
                <Link to="/driver" className="btn btn-primary" style={{ height: 52, padding: '0 28px', fontSize: 16 }}>
                  {t('land.driverBtn')}
                </Link>
                <a href="#qanday" className="btn" style={{ height: 52, padding: '0 28px', fontSize: 16, border: '1.5px solid rgba(255,255,255,.35)', background: 'transparent', color: '#fff' }}>
                  {t('land.driverMore')}
                </a>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
              <div style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 20, padding: 20 }}>
                <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 'clamp(24px,3vw,32px)', lineHeight: 1.2, color: '#FFC300' }}>0%</div>
                <div style={{ fontSize: 14, lineHeight: '20px', color: '#A3A3A3', marginTop: 4 }}>{t('land.driverCommission')}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 20, padding: 20 }}>
                <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 'clamp(24px,3vw,32px)', lineHeight: 1.2 }}>2 {lang === 'RU' ? 'мин' : 'daq'}</div>
                <div style={{ fontSize: 14, lineHeight: '20px', color: '#A3A3A3', marginTop: 4 }}>{t('land.driverPost')}</div>
              </div>
              <div style={{ gridColumn: '1 / -1', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 20, padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
                <span className="icon-tile" style={{ background: '#FFC300', color: '#111' }}>
                  <IconBox size={22} />
                </span>
                <div>
                  <div style={{ fontWeight: 600 }}>{t('land.driverCargoT')}</div>
                  <div style={{ fontSize: 14, lineHeight: '20px', color: '#A3A3A3' }}>{t('land.driverCargoD')}</div>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <Reviews />
      <Faq />
    </>
  );
}

