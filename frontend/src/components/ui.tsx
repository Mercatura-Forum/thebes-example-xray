import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }
export function Button({ variant = 'primary', className = '', ...props }: BtnProps) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed'
  const styles: Record<string, string> = {
    primary: 'bg-[var(--color-act)] text-[var(--color-act-ink)] hover:brightness-110 active:brightness-95',
    ghost: 'bg-transparent text-ink ring-1 ring-[var(--color-line)] hover:bg-white/5',
    danger: 'bg-transparent text-[var(--st-scheduled)] ring-1 ring-[var(--st-scheduled)]/40 hover:bg-[var(--st-scheduled)]/10',
  }
  return <button className={`${base} ${styles[variant]} ${className}`} {...props} />
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-soft/60 focus:border-[var(--color-act)] ${className}`}
      {...props}
    />
  )
}
export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-soft/60 focus:border-[var(--color-act)] ${className}`}
      {...props}
    />
  )
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</span>
      {children}
    </label>
  )
}

const STUDY_COLORS: Record<string, string> = {
  scheduled: 'var(--st-scheduled)', acquired: 'var(--st-acquired)', reported: 'var(--st-reported)',
}
export function StatusChip({ status }: { status: string }) {
  const c = STUDY_COLORS[status] ?? 'var(--st-none)'
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize"
      style={{ background: `color-mix(in srgb, ${c} 16%, transparent)`, color: c }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      {status}
    </span>
  )
}

const REPORT_COLORS: Record<string, string> = {
  none: 'var(--st-none)', preliminary: 'var(--st-scheduled)', final: 'var(--st-reported)',
}
export function ReportChip({ status }: { status: string }) {
  const c = REPORT_COLORS[status] ?? 'var(--st-none)'
  const label = status === 'none' ? 'no report' : `${status} report`
  return (
    <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
      style={{ background: `color-mix(in srgb, ${c} 12%, transparent)`, color: c }}>{label}</span>
  )
}

export function ModalityBadge({ modality }: { modality: string }) {
  return (
    <span className="mono inline-flex h-7 w-9 items-center justify-center rounded-md border border-[var(--color-line)] bg-[var(--color-surface-2)] text-xs font-bold tracking-wider text-[var(--color-act)]">
      {modality}
    </span>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-ink-soft text-sm" role="status">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-line)] border-t-[var(--color-act)]" />
      {label}…
    </div>
  )
}

export function EmptyState({ title, hint, action }: { title: string; hint: string; action?: ReactNode }) {
  return (
    <div className="card border-dashed p-10 text-center">
      <p className="font-display text-lg text-ink">{title}</p>
      <p className="mt-1 text-sm text-ink-soft">{hint}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

export function ErrorNote({ message }: { message: string }) {
  return <p className="rounded-lg border border-[var(--st-scheduled)]/30 bg-[var(--st-scheduled)]/10 px-3 py-2 text-sm text-[var(--st-scheduled)]">{message}</p>
}
