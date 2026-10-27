import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { relativeTime } from '../lib/format';
import { useI18n, type Lang } from '../lib/i18n';
import { useRealtime } from '../lib/realtime';
import { useTheme } from '../lib/theme';
import type { Notification } from '../lib/types';
import type { MessageKey } from '../locales/uz';
import { IconBell, IconBox, IconCar, IconLogout, IconMenu, IconMoon, IconSearch, IconSend, IconSettings, IconShield, IconSun, IconTicket, IconUser } from './Icons';
import { InstallBanner } from './InstallBanner';
import { Avatar, Button, Modal } from './ui';

function useOutside(ref: React.RefObject<HTMLElement | null>, onOut: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onOut();
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onOut]);
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const { t } = useI18n();
  const dark = theme === 'dark';
  return (
    <button className="theme-toggle" onClick={toggle} aria-label={dark ? t('nav.lightMode') : t('nav.darkMode')} title={dark ? t('nav.lightMode') : t('nav.darkMode')}>
      {dark ? <IconSun size={18} /> : <IconMoon size={18} />}
    </button>
  );
}

function LangSwitch() {
  const { lang, setLang } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const change = (l: Lang) => {
    setLang(l);
    // Foydalanuvchi tili serverda ham saqlanadi (bot va bildirishnomalar shu tilda)
    if (user && user.lang !== l) void api.patch('/users/me', { lang: l }).catch(() => {});
    void qc.invalidateQueries();
  };
  return (
    <div className="lang-switch" role="group" aria-label="Til / Язык">
      {(['UZ', 'RU'] as const).map((l) => (
        <button key={l} className={lang === l ? 'on' : ''} onClick={() => change(l)} aria-pressed={lang === l}>
          {l}
        </button>
      ))}
    </div>
  );
}

/** Bildirishnoma qayerga olib boradi */
function notificationLink(n: Notification, isDriver: boolean): string {
  const p = n.payload as Record<string, string>;
  if (n.type === 'driver:status') return '/driver';
  if (n.type === 'security:admin-login') return '/admin?s=audit';
  if (n.type === 'billing:payment:new') return '/admin?s=payments';
  if (n.type.startsWith('billing:')) return '/driver/tariff';
  if (n.type === 'ride:request:new' || n.type === 'ride:request:taken') return '/driver?tab=requests';
  if (n.type.startsWith('ride:request')) return isDriver ? '/driver?tab=requests' : '/my-trips?tab=requests';
  if (n.type === 'booking:new') return `/driver/trips/${p.tripId}`;
  if (n.type.startsWith('booking') || n.type === 'trip:updated') return isDriver && n.type !== 'trip:updated' ? `/driver/trips/${p.tripId}` : `/trips/${p.tripId}`;
  if (n.type === 'cargo:offer:new') return '/cargo/my';
  if (n.type.startsWith('cargo')) return isDriver ? '/driver/cargo' : '/cargo/my';
  return '/';
}

function Notifications() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();
  useOutside(ref, () => setOpen(false));

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.page<Notification>('/notifications', { limit: 20 }),
    refetchInterval: 60_000,
  });
  const unread = Number(data?.meta.unreadCount ?? 0);
  const readAll = useMutation({ mutationFn: () => api.post('/notifications/read-all'), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });

  const text = (n: Notification) => {
    const p = n.payload as Record<string, string | number>;
    const status = p.status ? t(`status.${p.status}` as MessageKey) : '';
    return t(`notif.${n.type}` as MessageKey, { seats: p.seats ?? '', price: p.price ?? '', status });
  };

  const openItem = async (n: Notification) => {
    setOpen(false);
    if (!n.readAt) void api.post(`/notifications/${n.id}/read`).then(() => qc.invalidateQueries({ queryKey: ['notifications'] }));
    navigate(notificationLink(n, user?.role === 'DRIVER'));
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label={t('nav.notifications')} aria-expanded={open}>
        <IconBell />
        {unread > 0 ? <span className="count-dot">{unread > 9 ? '9+' : unread}</span> : null}
      </button>
      {open ? (
        <div className="dropdown notif-list">
          <div className="row between" style={{ padding: '8px 12px' }}>
            <b style={{ fontFamily: 'var(--font-head)' }}>{t('nav.notifications')}</b>
            {unread > 0 ? (
              <button className="btn btn-ghost btn-sm" style={{ width: 'auto' }} onClick={() => readAll.mutate()}>
                {t('notif.readAll')}
              </button>
            ) : null}
          </div>
          {data?.items.length ? (
            data.items.map((n) => (
              <button key={n.id} className={`notif-item ${n.readAt ? '' : 'unread'}`} onClick={() => openItem(n)}>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontWeight: 500 }}>{text(n)}</span>
                  <span className="small faint">{relativeTime(n.createdAt, lang)}</span>
                </span>
              </button>
            ))
          ) : (
            <p className="muted small" style={{ padding: '12px', margin: 0 }}>
              {t('notif.empty')}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function UserMenu({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  if (!user) return null;
  const go = (to: string) => {
    onNavigate?.();
    navigate(to);
  };
  return (
    <>
      {user.role === 'DRIVER' ? (
        <button onClick={() => go('/driver')}>
          <IconCar size={18} /> {t('nav.driver')}
        </button>
      ) : null}
      <button onClick={() => go('/my-trips')}>
        <IconTicket size={18} /> {t('nav.myTrips')}
      </button>
      {user.role === 'SENDER' || user.role === 'PASSENGER' ? (
        <button onClick={() => go('/cargo/my')}>
          <IconBox size={18} /> {t('nav.myCargo')}
        </button>
      ) : null}
      {user.role === 'ADMIN' ? (
        <button onClick={() => go('/admin')}>
          <IconShield size={18} /> {t('nav.admin')}
        </button>
      ) : null}
      <button onClick={() => go('/profile')}>
        <IconSettings size={18} /> {t('nav.profile')}
      </button>
      <button
        onClick={async () => {
          onNavigate?.();
          await logout();
          navigate('/');
        }}
      >
        <IconLogout size={18} /> {t('nav.logout')}
      </button>
    </>
  );
}

function displayName(firstName: string | null, lastName: string | null) {
  return [firstName, lastName].filter(Boolean).join(' ') || '•';
}

export function Header() {
  const { t } = useI18n();
  const { user, status } = useAuth();
  const loc = useLocation();
  const isLanding = loc.pathname === '/';
  const appMode = loc.pathname !== '/login' && (!isLanding || status === 'user');
  const [scrolled, setScrolled] = useState(false);
  const [mobile, setMobile] = useState(() => window.innerWidth < 900);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);
  useOutside(userRef, () => setUserOpen(false));

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    const onResize = () => setMobile(window.innerWidth < 900);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, []);
  useEffect(() => setMenuOpen(false), [loc.pathname]);

  const landingNav = [
    ['#qanday', t('nav.how')],
    ['#haydovchi', t('nav.drivers')],
    ['#yuk', t('nav.cargo')],
    ['#aloqa', t('nav.contact')],
  ] as const;
  const appNav: [string, string][] = [['/search', t('nav.search')]];
  if (user?.role === 'DRIVER') appNav.push(['/driver', t('nav.driver')]);
  else if (user?.role === 'SENDER') appNav.push(['/cargo/my', t('nav.myCargo')]);
  else if (user) appNav.push(['/my-trips', t('nav.myTrips')]);
  if (user?.role === 'ADMIN') appNav.push(['/admin', t('nav.admin')]);

  const nav = isLanding
    ? landingNav.map(([href, label]) => (
        <a key={href} href={href} onClick={() => setMenuOpen(false)}>
          {label}
        </a>
      ))
    : appNav.map(([to, label]) => (
        <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'active' : '')}>
          {label}
        </NavLink>
      ));

  const loginLink = `/login?next=${encodeURIComponent(loc.pathname === '/login' ? '/' : loc.pathname + loc.search)}`;

  return (
    <header className={`header ${scrolled || menuOpen ? 'scrolled' : ''} ${isLanding ? '' : 'solid'}`}>
      <div className="header-inner">
        <Link to="/" className="logo" aria-label="Abu Tax">
          <span className="logo-mark">A</span>
          <span className="logo-text">Abu Tax</span>
        </Link>
        {!mobile ? <nav className="nav">{nav}</nav> : null}
        <div className="header-right">
          {!mobile ? <ThemeToggle /> : null}
          <LangSwitch />
          {status === 'user' && user ? (
            <>
              <Notifications />
              {!mobile ? (
                <div ref={userRef} style={{ position: 'relative' }}>
                  <button className="icon-btn" style={{ padding: 0, background: 'transparent' }} onClick={() => setUserOpen((o) => !o)} aria-label={t('nav.profile')} aria-expanded={userOpen}>
                    <Avatar name={displayName(user.firstName, user.lastName)} url={user.avatarUrl} size={44} />
                  </button>
                  {userOpen ? (
                    <div className="dropdown">
                      <div style={{ padding: '8px 12px 10px' }}>
                        <div style={{ fontWeight: 600 }}>{displayName(user.firstName, user.lastName)}</div>
                        <div className="small muted">{user.phone}</div>
                      </div>
                      <hr className="divider" />
                      <UserMenu onNavigate={() => setUserOpen(false)} />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : status === 'guest' && !(mobile && appMode) ? (
            <Link to={loginLink} className={`btn btn-dark ${mobile ? 'btn-sm' : ''}`}>
              {t('nav.login')}
            </Link>
          ) : null}
          {mobile ? (
            <button className="icon-btn" onClick={() => setMenuOpen((o) => !o)} aria-label={t('nav.menu')} aria-expanded={menuOpen}>
              <IconMenu />
            </button>
          ) : null}
        </div>
      </div>
      {mobile && menuOpen ? (
        <nav className="mobile-nav">
          {nav}
          <div className="row between" style={{ padding: '10px 4px', borderBottom: '1px solid var(--border)' }}>
            <span>{t('nav.theme')}</span>
            <ThemeToggle />
          </div>
          {user ? <UserMenu onNavigate={() => setMenuOpen(false)} /> : null}
        </nav>
      ) : null}
    </header>
  );
}

export function Footer() {
  const { t } = useI18n();
  return (
    <footer id="aloqa" className="footer">
      <div className="footer-inner">
        <div className="grid-3" style={{ gap: 32 }}>
          <div className="stack">
            <span className="logo">
              <span className="logo-mark">A</span>
              <span className="logo-text" style={{ color: '#fff' }}>
                Abu Tax
              </span>
            </span>
            <p style={{ margin: 0, fontSize: 14, lineHeight: '20px', color: '#A3A3A3', maxWidth: 260 }}>{t('land.footerTag')}</p>
          </div>
          <div className="stack-sm" style={{ fontSize: 15 }}>
            <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6B6B6B', marginBottom: 4 }}>{t('land.footerServices')}</span>
            <Link to="/search">{t('land.footerPass')}</Link>
            <Link to="/cargo/new">{t('nav.cargo')}</Link>
            <Link to="/driver">{t('nav.drivers')}</Link>
            <a href="/#qanday">{t('nav.how')}</a>
          </div>
          <div className="stack-sm" style={{ fontSize: 15 }}>
            <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6B6B6B', marginBottom: 4 }}>{t('nav.contact')}</span>
            <a href="tel:+998901234567" style={{ color: '#fff', fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: 18 }} className="num">
              +998 (90) 123-45-67
            </a>
            <a href="https://t.me/abutax_uz" target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <IconSend /> @abutax_uz
            </a>
            <span style={{ color: '#A3A3A3', fontSize: 14 }}>{t('land.footerHours')}</span>
          </div>
        </div>
        <div className="row-wrap between" style={{ paddingTop: 24, borderTop: '1px solid #2A2A2A', fontSize: 13, color: '#6B6B6B' }}>
          <span>© 2026 Abu Tax</span>
          <span>{t('land.footerTerms')}</span>
        </div>
      </div>
    </footer>
  );
}

/** Telefonda ilovadagidek pastki menyu (rolga qarab). Faol bo'lim yo'l va ?tab= bo'yicha aniqlanadi. */
function BottomNav() {
  const { t } = useI18n();
  const { user, status } = useAuth();
  const loc = useLocation();
  const here = loc.pathname + loc.search;
  type Item = { to: string; label: string; icon: React.ReactNode; match: (p: string) => boolean };
  const search: Item = { to: '/search', label: t('nav.short.search'), icon: <IconSearch size={20} />, match: (p) => p.startsWith('/search') || p.startsWith('/trips/') };
  const profile: Item = { to: '/profile', label: t('nav.short.profile'), icon: <IconUser size={20} />, match: (p) => p.startsWith('/profile') };
  let items: Item[];
  if (status !== 'user' || !user) {
    items = [
      search,
      { to: '/cargo/new', label: t('nav.short.sendCargo'), icon: <IconBox size={20} />, match: (p) => p.startsWith('/cargo') },
      { to: '/driver', label: t('nav.short.drivers'), icon: <IconCar size={20} />, match: (p) => p.startsWith('/driver') },
      { to: `/login?next=${encodeURIComponent(here)}`, label: t('nav.short.login'), icon: <IconUser size={20} />, match: (p) => p.startsWith('/login') },
    ];
  } else if (user.role === 'DRIVER') {
    items = [
      { to: '/driver', label: t('nav.short.cabinet'), icon: <IconCar size={20} />, match: (p) => p === '/driver' || (p.startsWith('/driver') && !p.includes('tab=requests') && !p.startsWith('/driver/cargo')) },
      { to: '/driver?tab=requests', label: t('nav.short.requests'), icon: <IconSend size={20} />, match: (p) => p.includes('tab=requests') },
      { to: '/driver/cargo', label: t('nav.short.cargoOpen'), icon: <IconBox size={20} />, match: (p) => p.startsWith('/driver/cargo') },
      profile,
    ];
  } else if (user.role === 'SENDER') {
    items = [
      { to: '/cargo/my', label: t('nav.short.cargo'), icon: <IconBox size={20} />, match: (p) => p.startsWith('/cargo/my') },
      { to: '/cargo/new', label: t('nav.short.sendCargo'), icon: <IconSend size={20} />, match: (p) => p.startsWith('/cargo/new') },
      search,
      profile,
    ];
  } else if (user.role === 'ADMIN') {
    items = [{ to: '/admin', label: t('nav.admin'), icon: <IconShield size={20} />, match: (p) => p.startsWith('/admin') }, search, profile];
  } else {
    items = [
      search,
      { to: '/my-trips', label: t('nav.short.trips'), icon: <IconTicket size={20} />, match: (p) => p.startsWith('/my-trips') },
      { to: '/cargo/my', label: t('nav.short.cargo'), icon: <IconBox size={20} />, match: (p) => p.startsWith('/cargo') },
      profile,
    ];
  }
  return (
    <nav className="bottom-nav" aria-label={t('nav.menu')}>
      {items.map((i) => (
        <Link key={i.label} to={i.to} className={i.match(here) ? 'active' : ''} aria-current={i.match(here) ? 'page' : undefined}>
          <span className="bn-icon">{i.icon}</span>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

/** "Tarif kerak" oynasi: haydovchi to'lovsiz yo'lovchini tasdiqlamoqchi / so'rov olmoqchi bo'lganda chiqadi. */
function SubscriptionGate() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener('abutax:subscription-required', on);
    return () => window.removeEventListener('abutax:subscription-required', on);
  }, []);
  if (!open) return null;
  return (
    <Modal open onClose={() => setOpen(false)} title={t('bill.gateTitle')}>
      <div className="stack">
        <div className="tariff-gate-icon">💳</div>
        <p style={{ margin: 0 }}>{t('bill.gateText')}</p>
        <Button
          size="lg"
          block
          onClick={() => {
            setOpen(false);
            navigate('/driver/tariff');
          }}
        >
          {t('bill.gatePay')}
        </Button>
      </div>
    </Modal>
  );
}

export function Layout() {
  useRealtime();
  const loc = useLocation();
  // Sahifa almashganda tepaga (hash havolalardan tashqari)
  useEffect(() => {
    if (!loc.hash) window.scrollTo(0, 0);
  }, [loc.pathname, loc.hash]);
  const { status } = useAuth();
  // Mehmon uchun landing va kirish sahifasi — oddiy sayt; qolganlarida (va kirgan foydalanuvchiga hamma joyda) — ilova ko'rinishi
  const appMode = loc.pathname !== '/login' && (loc.pathname !== '/' || status === 'user');
  return (
    <div className={`app-shell ${appMode ? 'has-bottom-nav' : ''}`}>
      <Header />
      <InstallBanner />
      <main style={{ flex: 1 }}>
        <Outlet />
      </main>
      <Footer />
      {appMode ? <BottomNav /> : null}
      <SubscriptionGate />
    </div>
  );
}
