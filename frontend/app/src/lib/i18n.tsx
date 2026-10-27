import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { ru } from '../locales/ru';
import { uz, type MessageKey } from '../locales/uz';
import { readLocal, writeLocal } from './storage';

export type Lang = 'UZ' | 'RU';
const DICTS: Record<Lang, Record<MessageKey, string>> = { UZ: uz, RU: ru };
const KEY = 'abutax.lang';

/** API so'rovlari Accept-Language uchun joriy tilni bilishi kerak (React'dan tashqarida). */
let currentLang: Lang = readLocal(KEY) === 'RU' ? 'RU' : 'UZ';
export const getLang = () => currentLang;

type Vars = Record<string, string | number>;
export type TFn = (key: MessageKey, vars?: Vars) => string;

function translate(lang: Lang, key: MessageKey, vars?: Vars): string {
  let s = DICTS[lang][key] ?? uz[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: TFn;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(currentLang);
  const setLang = useCallback((l: Lang) => {
    currentLang = l;
    writeLocal(KEY, l);
    document.documentElement.lang = l === 'RU' ? 'ru' : 'uz';
    setLangState(l);
  }, []);
  const t = useCallback<TFn>((key, vars) => translate(lang, key, vars), [lang]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n I18nProvider ichida ishlatilishi kerak');
  return v;
}
