import { useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n';
import { readLocal, writeLocal } from '../lib/storage';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'abutax.installDismissed';

/**
 * "Ilovani o'rnatish" taklifi (PWA): brauzer `beforeinstallprompt` bersa (Android/Chrome) va
 * foydalanuvchi oldin yopmagan bo'lsa ko'rinadi. O'rnatilgach sayt telefonda alohida ilova bo'lib ochiladi.
 */
export function InstallBanner() {
  const { t } = useI18n();
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (readLocal(DISMISS_KEY)) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setEvt(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!evt) return null;
  const close = () => {
    writeLocal(DISMISS_KEY, '1');
    setEvt(null);
  };
  return (
    <div className="install-banner" role="dialog" aria-label={t('pwa.title')}>
      <span className="logo-mark">A</span>
      <p>
        <b>{t('pwa.title')}</b>
        <br />
        <span style={{ color: '#a3a3a3' }}>{t('pwa.hint')}</span>
      </p>
      <button
        className="btn btn-primary btn-sm"
        onClick={async () => {
          await evt.prompt();
          await evt.userChoice.catch(() => null);
          setEvt(null);
        }}
      >
        {t('pwa.install')}
      </button>
      <button className="x" onClick={close} aria-label={t('common.close')}>
        ×
      </button>
    </div>
  );
}
