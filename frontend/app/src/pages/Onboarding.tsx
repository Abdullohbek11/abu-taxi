import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { IconBox, IconCar, IconUsers } from '../components/Icons';
import { Alert, Button, Input } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { errorText, fieldErrors } from '../lib/errors';
import { useI18n } from '../lib/i18n';
import type { Me, Role } from '../lib/types';
import { landingFor } from './Login';

type Choice = Exclude<Role, 'ADMIN'>;

export default function Onboarding() {
  const { t } = useI18n();
  const { user, setRole, applySession, reloadMe } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [role, setChoice] = useState<Choice>(user?.role && user.role !== 'ADMIN' ? user.role : 'PASSENGER');
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const options: { value: Choice; icon: React.ReactNode; title: string; desc: string }[] = [
    { value: 'PASSENGER', icon: <IconUsers size={22} />, title: t('onb.passenger'), desc: t('onb.passengerD') },
    { value: 'SENDER', icon: <IconBox size={22} />, title: t('onb.sender'), desc: t('onb.senderD') },
    { value: 'DRIVER', icon: <IconCar size={22} />, title: t('onb.driver'), desc: t('onb.driverD') },
  ];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const names = { firstName: firstName.trim(), ...(lastName.trim() ? { lastName: lastName.trim() } : {}) };
      if (names.firstName !== (user?.firstName ?? '') || (names.lastName ?? '') !== (user?.lastName ?? '')) {
        await api.patch('/users/me', names);
      }
      if (role === 'DRIVER') {
        // Haydovchi profili yaratiladi (rol ham DRIVER bo'ladi); hujjatlar kabinetda yuklanadi
        if (!user?.driverProfile) {
          const res = await api.post<{ user: Me; accessToken: string }>('/drivers/register', { firstName: names.firstName, lastName: names.lastName ?? names.firstName });
          applySession({ accessToken: res.accessToken, user: res.user });
        } else await setRole('DRIVER');
        navigate('/driver', { replace: true });
        return;
      }
      await setRole(role);
      await reloadMe();
      navigate(landingFor({ ...user!, role }, params.get('next')), { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const fe = fieldErrors(error);
  return (
    <form className="page page-narrow stack" onSubmit={submit} style={{ gap: 24 }}>
      <div>
        <h1 className="page-title">{t('onb.title')}</h1>
        <p className="page-sub">{t('onb.lead')}</p>
      </div>
      <div className="grid-3" role="radiogroup">
        {options.map((o) => (
          <button type="button" key={o.value} role="radio" aria-checked={role === o.value} className={`role-card ${role === o.value ? 'on' : ''}`} onClick={() => setChoice(o.value)}>
            <span className="icon-tile">{o.icon}</span>
            <b style={{ fontFamily: 'var(--font-head)', fontSize: 18 }}>{o.title}</b>
            <span className="small muted">{o.desc}</span>
          </button>
        ))}
      </div>
      <div className="card stack">
        <b>{t('onb.name')}</b>
        <div className="grid-2">
          <Input label={t('onb.firstName')} value={firstName} onChange={(e) => setFirstName(e.target.value)} required minLength={2} maxLength={50} autoComplete="given-name" error={fe.firstName} />
          <Input label={`${t('onb.lastName')}${role === 'DRIVER' ? '' : ` (${t('common.optional')})`}`} value={lastName} onChange={(e) => setLastName(e.target.value)} required={role === 'DRIVER'} minLength={2} maxLength={50} autoComplete="family-name" error={fe.lastName} />
        </div>
      </div>
      {error && !Object.keys(fe).length ? <Alert kind="error">{errorText(error, t)}</Alert> : null}
      <Button size="lg" type="submit" loading={busy} disabled={firstName.trim().length < 2}>
        {t('onb.continue')}
      </Button>
    </form>
  );
}
