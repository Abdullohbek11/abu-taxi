import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { IconShield } from '../../components/Icons';
import { Alert, Button, Input } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { errorText } from '../../lib/errors';
import { useI18n } from '../../lib/i18n';
import type { Me } from '../../lib/types';

/**
 * Admin panelga kirish: telefon + parol (faqat ADMIN uchun; oddiy foydalanuvchilar Telegram bot orqali kiradi).
 * Parol serverda scrypt bilan saqlanadi; 5 ta xato urinishdan keyin hisob 30 daqiqaga qulflanadi.
 */
export default function AdminLogin() {
  const { t } = useI18n();
  const { applySession, status, user } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('+998');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (status === 'user' && user?.role === 'ADMIN') return <Navigate to="/admin" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const s = await api.post<{ accessToken: string; user: Me }>('/auth/admin/login', { login: phone, password });
      applySession(s);
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(errorText(err, t));
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page page-narrow" style={{ maxWidth: 440 }}>
      <form className="card card-lg stack admin-login" onSubmit={submit} autoComplete="on">
        <div className="stack-sm" style={{ alignItems: 'center', textAlign: 'center' }}>
          <span className="admin-login-icon">
            <IconShield size={28} />
          </span>
          <h1 className="page-title" style={{ fontSize: 26, margin: 0 }}>
            {t('adm.loginTitle')}
          </h1>
          <p className="muted small" style={{ margin: 0 }}>
            {t('adm.loginHint')}
          </p>
        </div>
        <Input label={t('adm.loginPhone')} type="tel" inputMode="tel" autoComplete="username" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        <div className="field">
          <span className="field-label">{t('adm.loginPassword')}</span>
          <div className="pw-wrap">
            <input
              className="input"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              maxLength={128}
              required
              aria-label={t('adm.loginPassword')}
            />
            <button type="button" className="pw-toggle" onClick={() => setShow((v) => !v)} aria-pressed={show}>
              {show ? t('adm.hide') : t('adm.show')}
            </button>
          </div>
        </div>
        {error ? <Alert kind="error">{error}</Alert> : null}
        <Button type="submit" size="lg" block loading={busy} disabled={!password || phone.replace(/\D/g, '').length < 12}>
          {t('adm.loginSubmit')}
        </Button>
        <p className="faint small" style={{ margin: 0, textAlign: 'center' }}>
          {t('adm.loginSecurity')}
        </p>
      </form>
    </div>
  );
}
