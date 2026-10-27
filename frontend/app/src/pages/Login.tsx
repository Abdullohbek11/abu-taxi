import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { IconSend } from '../components/Icons';
import { Alert } from '../components/ui';
import { useAuth } from '../lib/auth';
import { errorText } from '../lib/errors';
import { useI18n } from '../lib/i18n';
import { useToast } from '../lib/toast';
import type { Me } from '../lib/types';

export const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME || 'taxizakRObot';
const LEN = 6;
// Backend alifbosi: I, O, 0, 1 yo'q (chalkashmasligi uchun)
const ALLOWED = /[A-HJ-NP-Z2-9]/;

function clean(s: string): string {
  return [...s.toUpperCase()].filter((c) => ALLOWED.test(c)).join('');
}

/** Kirgandan keyin qayerga: yangi foydalanuvchi — rol tanlash; aks holda kelgan sahifa yoki rolga mos kabinet */
export function landingFor(user: Me, next: string | null): string {
  if (!user.role) return `/onboarding${next ? `?next=${encodeURIComponent(next)}` : ''}`;
  if (next && next.startsWith('/') && !next.startsWith('//')) return next;
  if (user.role === 'DRIVER') return '/driver';
  if (user.role === 'ADMIN') return '/admin';
  return '/search';
}

export function Login() {
  const { t } = useI18n();
  const { loginWithCode, status, user } = useAuth();
  const [params] = useSearchParams();
  const next = params.get('next');
  const navigate = useNavigate();
  const toast = useToast();
  const [chars, setChars] = useState<string[]>(Array(LEN).fill(''));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => refs.current[0]?.focus(), []);

  const submit = async (code: string) => {
    setBusy(true);
    setError('');
    try {
      const s = await loginWithCode(code);
      toast(t('login.success'));
      navigate(landingFor(s.user, next), { replace: true });
    } catch (err) {
      setError(errorText(err, t));
      setChars(Array(LEN).fill(''));
      setTimeout(() => refs.current[0]?.focus(), 0);
    } finally {
      setBusy(false);
    }
  };

  const fill = (start: number, text: string) => {
    const add = clean(text);
    if (!add) return;
    const nextChars = [...chars];
    let i = start;
    for (const c of add) {
      if (i >= LEN) break;
      nextChars[i++] = c;
    }
    setChars(nextChars);
    setError('');
    refs.current[Math.min(i, LEN - 1)]?.focus();
    if (nextChars.every(Boolean)) void submit(nextChars.join(''));
  };

  if (status === 'user' && user && !busy) return <Navigate to={landingFor(user, next)} replace />;

  return (
    <div className="page" style={{ maxWidth: 520, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, paddingTop: 'clamp(40px,8vw,88px)' }}>
      <span className="logo-mark" style={{ width: 64, height: 64, fontSize: 34, borderRadius: 18, animation: 'abUp 500ms both' }}>
        A
      </span>
      <h1 className="page-title">{t('login.title')}</h1>
      <p className="muted" style={{ margin: 0, maxWidth: 380 }}>
        <a href={`https://t.me/${BOT_USERNAME}?start=login`} target="_blank" rel="noreferrer" style={{ color: 'var(--ink)', fontWeight: 700, textDecoration: 'underline', textDecorationColor: '#FFC300', textDecorationThickness: 2, textUnderlineOffset: 3 }}>
          @{BOT_USERNAME}
        </a>{' '}
        {t('login.lead')}
      </p>

      <form
        className={`otp ${error ? 'error' : ''}`}
        onSubmit={(e) => {
          e.preventDefault();
          if (chars.every(Boolean)) void submit(chars.join(''));
        }}
        aria-label={t('login.title')}
      >
        {chars.map((c, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={c}
            inputMode="text"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={LEN}
            disabled={busy}
            aria-label={`${i + 1}`}
            onChange={(e) => fill(i, e.target.value.slice(-LEN))}
            onPaste={(e) => {
              e.preventDefault();
              fill(0, e.clipboardData.getData('text'));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Backspace' && !chars[i] && i > 0) {
                const n = [...chars];
                n[i - 1] = '';
                setChars(n);
                refs.current[i - 1]?.focus();
              } else if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
              else if (e.key === 'ArrowRight' && i < LEN - 1) refs.current[i + 1]?.focus();
            }}
          />
        ))}
      </form>

      {busy ? <span className="muted small">{t('login.checking')}</span> : null}
      {error ? <Alert kind="error">{error}</Alert> : null}

      <a href={`https://t.me/${BOT_USERNAME}?start=login`} target="_blank" rel="noreferrer" className="btn btn-primary btn-lg" style={{ marginTop: 8 }}>
        <IconSend />
        {t('login.openBot')}
      </a>
      <div className="card card-soft small muted" style={{ textAlign: 'left', lineHeight: '20px' }}>
        {t('login.steps')
          .split(/\s{2,}/)
          .map((s) => (
            <div key={s}>{s}</div>
          ))}
        <div className="faint" style={{ marginTop: 6 }}>
          {t('login.noPassword')}
        </div>
      </div>
    </div>
  );
}
