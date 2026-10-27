import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import type { Role } from '../lib/types';
import { Empty, Spinner } from './ui';

/** Kirish talab qilinadigan sahifalar. Rol tanlanmagan bo'lsa — onboarding'ga. */
export function RequireAuth({ children, roles, allowNoRole }: { children: ReactNode; roles?: Role[]; allowNoRole?: boolean }) {
  const { status, user } = useAuth();
  const { t } = useI18n();
  const loc = useLocation();
  const next = encodeURIComponent(loc.pathname + loc.search);

  if (status === 'loading') return <Spinner center />;
  // Admin panel — o'zining parolli kirish sahifasi
  if (!user) return <Navigate to={roles?.length === 1 && roles[0] === 'ADMIN' ? '/admin/login' : `/login?next=${next}`} replace />;
  if (!user.role && !allowNoRole) return <Navigate to={`/onboarding?next=${next}`} replace />;
  if (roles && (!user.role || !roles.includes(user.role))) {
    return (
      <div className="page page-narrow">
        <Empty title={t('auth.forbidden')} />
      </div>
    );
  }
  return <>{children}</>;
}
