import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IconLogout, IconUpload } from '../components/Icons';
import { Alert, Avatar, Button, Input, Segmented } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { errorText, fieldErrors } from '../lib/errors';
import { phoneDisplay } from '../lib/format';
import { useI18n, type Lang } from '../lib/i18n';
import { useToast } from '../lib/toast';
import type { Me } from '../lib/types';
import type { MessageKey } from '../locales/uz';

const ROLE_KEY: Record<string, MessageKey> = { PASSENGER: 'onb.passenger', SENDER: 'onb.sender', DRIVER: 'onb.driver', ADMIN: 'nav.admin' };

export default function Profile() {
  const { t, setLang } = useI18n();
  const { user, reloadMe, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');

  const save = useMutation({
    mutationFn: (body: Partial<Pick<Me, 'firstName' | 'lastName' | 'lang'>>) => api.patch<Me>('/users/me', body),
    onSuccess: async () => {
      await reloadMe();
      toast(t('common.saved'));
    },
  });
  const avatar = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.upload<Me>('/users/me/avatar', form);
    },
    onSuccess: () => reloadMe(),
    onError: (err) => toast(errorText(err, t), 'error'),
  });

  if (!user) return null;
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.phone || '';
  const fe = fieldErrors(save.error);

  return (
    <div className="page page-narrow stack" style={{ gap: 20 }}>
      <h1 className="page-title">{t('profile.title')}</h1>

      <div className="card row" style={{ gap: 16, flexWrap: 'wrap' }}>
        <Avatar name={name} url={user.avatarUrl} size={72} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <b style={{ fontSize: 20, fontFamily: 'var(--font-head)' }}>{name}</b>
          <div className="row-wrap" style={{ marginTop: 6 }}>
            {user.role ? <span className="badge badge-yellow">{t(ROLE_KEY[user.role]!)}</span> : null}
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => e.target.files?.[0] && avatar.mutate(e.target.files[0])} />
        <Button variant="ghost" size="sm" loading={avatar.isPending} onClick={() => fileRef.current?.click()}>
          <IconUpload size={16} /> {t('profile.avatar')}
        </Button>
      </div>

      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({ firstName: firstName.trim(), ...(lastName.trim() ? { lastName: lastName.trim() } : {}) });
        }}
      >
        <div className="grid-2">
          <Input label={t('onb.firstName')} value={firstName} onChange={(e) => setFirstName(e.target.value)} minLength={2} maxLength={50} required error={fe.firstName} />
          <Input label={t('onb.lastName')} value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={50} error={fe.lastName} />
        </div>
        {save.isError && !Object.keys(fe).length ? <Alert kind="error">{errorText(save.error, t)}</Alert> : null}
        <Button type="submit" loading={save.isPending} style={{ alignSelf: 'flex-start' }}>
          {t('common.save')}
        </Button>
      </form>

      <div className="card stack">
        <div className="grid-2">
          <div className="stat">
            <span className="small muted">{t('profile.phone')}</span>
            <b style={{ fontSize: 18 }}>{phoneDisplay(user.phone)}</b>
          </div>
          <div className="stat">
            <span className="small muted">{t('profile.telegram')}</span>
            <b style={{ fontSize: 18 }}>{user.telegramUsername ? `@${user.telegramUsername}` : user.telegramId ? '✓' : '—'}</b>
          </div>
        </div>
        <span className="small faint">{t('profile.phoneNote')}</span>
        <div className="field">
          <span className="field-label">{t('profile.lang')}</span>
          <Segmented<Lang>
            value={user.lang}
            onChange={(l) => {
              setLang(l);
              save.mutate({ lang: l });
            }}
            options={[
              { value: 'UZ', label: "O'zbekcha" },
              { value: 'RU', label: 'Русский' },
            ]}
          />
        </div>
        {user.role !== 'ADMIN' ? (
          <Link to="/onboarding" className="btn btn-ghost" style={{ alignSelf: 'flex-start' }}>
            {t('profile.changeRole')}
          </Link>
        ) : null}
      </div>

      <div className="row-wrap">
        <Button
          variant="outline"
          onClick={async () => {
            await logout();
            navigate('/');
          }}
        >
          <IconLogout size={18} /> {t('nav.logout')}
        </Button>
        <Button
          variant="danger"
          onClick={async () => {
            await logout(true);
            navigate('/');
          }}
        >
          {t('profile.logoutAll')}
        </Button>
      </div>
    </div>
  );
}
