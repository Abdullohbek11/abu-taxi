import { Link } from 'react-router-dom';
import { Empty } from '../components/ui';
import { useI18n } from '../lib/i18n';

export function NotFound() {
  const { t } = useI18n();
  return (
    <div className="page page-narrow">
      <Empty
        title={t('nf.title')}
        action={
          <Link to="/" className="btn btn-primary">
            {t('nf.home')}
          </Link>
        }
      />
    </div>
  );
}
