import { useCallback, useEffect, useState } from 'react';
import { readLocal, writeLocal } from './storage';

export type Theme = 'light' | 'dark';
const KEY = 'abutax.theme';

/** Saqlangan tanlov, bo'lmasa — tizim sozlamasi (index.html'dagi skript ham shu qoidaga amal qiladi) */
function initialTheme(): Theme {
  const saved = readLocal(KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0F0F0F' : '#FFC300');
}

/** Kunduzgi / tungi rejim */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  useEffect(() => apply(theme), [theme]);
  // Foydalanuvchi o'zi tanlamagan bo'lsa — tizim o'zgarishiga ergashadi
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => {
      if (!readLocal(KEY)) setTheme(e.matches ? 'dark' : 'light');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      writeLocal(KEY, next);
      return next;
    });
  }, []);
  return { theme, toggle };
}
