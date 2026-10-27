import { createPortal } from 'react-dom';
import { useEffect, useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { initials } from '../lib/format';
import { useI18n } from '../lib/i18n';
import type { MessageKey } from '../locales/uz';
import { IconMinus, IconPlus, Star } from './Icons';

type BtnVariant = 'primary' | 'dark' | 'outline' | 'ghost' | 'danger' | 'success';

export function Button({
  variant = 'primary',
  size,
  block,
  loading,
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'lg'; block?: boolean; loading?: boolean }) {
  return (
    <button
      className={`btn btn-${variant} ${size ? `btn-${size}` : ''} ${block ? 'btn-block' : ''} ${className}`}
      disabled={rest.disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="spinner" style={{ width: 18, height: 18, borderTopColor: 'currentColor' }} /> : null}
      {children}
    </button>
  );
}

export function Field({ label, error, hint, children }: { label?: ReactNode; error?: string; hint?: ReactNode; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="field">
      {label ? (
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
      ) : null}
      {children(id)}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}

export function Input({ label, error, hint, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; error?: string; hint?: ReactNode }) {
  return <Field label={label} error={error} hint={hint}>{(id) => <input id={id} className={`input ${error ? 'invalid' : ''}`} aria-invalid={!!error} {...rest} />}</Field>;
}

export function Select({ label, error, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label?: ReactNode; error?: string }) {
  return (
    <Field label={label} error={error}>
      {(id) => (
        <select id={id} className={`select ${error ? 'invalid' : ''}`} {...rest}>
          {children}
        </select>
      )}
    </Field>
  );
}

export function Textarea({ label, error, hint, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode; error?: string; hint?: ReactNode }) {
  return <Field label={label} error={error} hint={hint}>{(id) => <textarea id={id} className={`textarea ${error ? 'invalid' : ''}`} {...rest} />}</Field>;
}

export function Checkbox({ label, checked, onChange }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function Stepper({ value, min = 1, max, onChange, label }: { value: number; min?: number; max: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="stepper">
      <span className="stepper-value">{label}</span>
      <button type="button" aria-label="−" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}>
        <IconMinus />
      </button>
      <button type="button" aria-label="+" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>
        <IconPlus />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Avatar({ name, url, size = 48 }: { name: string; url?: string | null; size?: number }) {
  if (url) return <img src={url} alt="" className="avatar" style={{ width: size, height: size }} />;
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }} aria-hidden="true">
      {initials(name) || '?'}
    </span>
  );
}

export function Rating({ value, count }: { value: number; count?: number }) {
  if (!count) return null;
  return (
    <span className="stars">
      <Star />
      {value.toFixed(1)}
      {count !== undefined ? <span className="faint">({count})</span> : null}
    </span>
  );
}

const STATUS_TONE: Record<string, string> = {
  PENDING: 'badge-orange',
  CONFIRMED: 'badge-green',
  APPROVED: 'badge-green',
  ACCEPTED: 'badge-green',
  COMPLETED: 'badge-dark',
  DELIVERED: 'badge-dark',
  REJECTED: 'badge-red',
  CANCELLED: 'badge-red',
  WITHDRAWN: '',
  SCHEDULED: 'badge-yellow',
  OPEN: 'badge-yellow',
  IN_PROGRESS: 'badge-yellow',
  IN_TRANSIT: 'badge-yellow',
  MATCHED: 'badge-green',
  ASSIGNED: 'badge-green',
  EXPIRED: '',
};

export function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  return <span className={`badge ${STATUS_TONE[status] ?? ''}`}>{t(`status.${status}` as MessageKey)}</span>;
}

export function Spinner({ center }: { center?: boolean }) {
  return center ? (
    <div className="center">
      <span className="spinner" />
    </div>
  ) : (
    <span className="spinner" />
  );
}

export function Skeleton({ height = 96, count = 3 }: { height?: number; count?: number }) {
  return (
    <div className="stack" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton" style={{ height }} />
      ))}
    </div>
  );
}

export function Empty({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon ? <div className="empty-icon">{icon}</div> : null}
      <h3 style={{ fontSize: 18 }}>{title}</h3>
      {hint ? <p className="muted" style={{ margin: 0, maxWidth: 420 }}>{hint}</p> : null}
      {action ? <div style={{ marginTop: 8 }}>{action}</div> : null}
    </div>
  );
}

export function Alert({ kind = 'info', children }: { kind?: 'info' | 'error' | 'success' | 'warning'; children: ReactNode }) {
  return (
    <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : undefined}>
      {children}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="empty">
      <h3 style={{ fontSize: 18 }}>{message}</h3>
      {onRetry ? (
        <Button variant="ghost" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      ) : null}
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  // body'ga chiqariladi: sahifa animatsiyasi yaratgan qatlam ichida qolib, sticky header ostida yashirinmasligi uchun
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="row between" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 20 }}>{title}</h3>
          <button className="icon-btn" style={{ width: 36, height: 36 }} onClick={onClose} aria-label="×">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function RouteLine({ from, to, fromSub, toSub }: { from: ReactNode; to: ReactNode; fromSub?: ReactNode; toSub?: ReactNode }) {
  return (
    <div className="route">
      <div className="route-dots">
        <span className="start" />
        <span className="line" />
        <span className="end" />
      </div>
      <div>
        <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{from}</div>
        {fromSub ? <div className="small muted">{fromSub}</div> : null}
      </div>
      <div>
        <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{to}</div>
        {toSub ? <div className="small muted">{toSub}</div> : null}
      </div>
    </div>
  );
}

/** Tasdiqlash oynasi (window.confirm/prompt o'rniga). `reasonLabel` berilsa — sabab maydoni majburiy. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger,
  reasonLabel,
  reasonPlaceholder,
  loading,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  loading?: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) setReason('');
  }, [open]);
  const needReason = !!reasonLabel;
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (!needReason || reason.trim().length >= 3) onConfirm(reason.trim());
        }}
      >
        {message ? <div className="muted">{message}</div> : null}
        {needReason ? <Textarea label={reasonLabel} placeholder={reasonPlaceholder} value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} maxLength={500} rows={3} required autoFocus /> : null}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant={danger ? 'danger' : 'primary'} loading={loading} disabled={needReason && reason.trim().length < 3}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
