import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, onSessionChange, refreshSession, setAccessToken } from './api';
import { useI18n } from './i18n';
import type { Me, Role } from './types';

type Status = 'loading' | 'guest' | 'user';

interface Session {
  accessToken: string;
  user: Me;
  isNew?: boolean;
}

interface Auth {
  status: Status;
  user: Me | null;
  /** Botdan olingan kod bilan kirish */
  loginWithCode: (code: string) => Promise<Session>;
  /** Server yangi access token qaytargan javoblar (rol tanlash, haydovchi bo'lish) */
  applySession: (s: { accessToken: string; user: Me }) => void;
  setRole: (role: Exclude<Role, 'ADMIN'>) => Promise<void>;
  reloadMe: () => Promise<void>;
  logout: (all?: boolean) => Promise<void>;
}

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<Me | null>(null);
  const { setLang } = useI18n();
  const qc = useQueryClient();

  const apply = useCallback(
    (s: { accessToken: string; user: Me } | null) => {
      if (!s) {
        setAccessToken(null);
        setUser(null);
        setStatus('guest');
        return;
      }
      setAccessToken(s.accessToken);
      setUser(s.user);
      setStatus('user');
    },
    [],
  );

  // Sahifa ochilganda: refresh cookie bo'lsa sessiyani tiklash
  useEffect(() => {
    onSessionChange(apply);
    void refreshSession().then((ok) => {
      if (!ok) apply(null);
    });
  }, [apply]);

  const loginWithCode = useCallback(
    async (code: string) => {
      const s = await api.post<Session>('/auth/code', { code });
      apply(s);
      setLang(s.user.lang);
      qc.clear();
      return s;
    },
    [apply, qc, setLang],
  );

  const setRole = useCallback(
    async (role: Exclude<Role, 'ADMIN'>) => {
      const res = await api.patch<{ user: Me; accessToken: string }>('/users/me/role', { role });
      apply({ accessToken: res.accessToken, user: res.user });
    },
    [apply],
  );

  const reloadMe = useCallback(async () => {
    const me = await api.get<Me>('/users/me');
    setUser(me);
  }, []);

  const logout = useCallback(
    async (all = false) => {
      await api.post(all ? '/auth/logout-all' : '/auth/logout').catch(() => {});
      apply(null);
      qc.clear();
    },
    [apply, qc],
  );

  const value = useMemo<Auth>(
    () => ({ status, user, loginWithCode, applySession: apply, setRole, reloadMe, logout }),
    [status, user, loginWithCode, apply, setRole, reloadMe, logout],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): Auth {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth AuthProvider ichida ishlatilishi kerak');
  return v;
}
