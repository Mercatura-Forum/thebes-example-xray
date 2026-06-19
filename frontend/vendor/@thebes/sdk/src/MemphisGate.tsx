/**
 * MemphisGate — open-demo wrapper with Memphis passkey sign-in on demand.
 *
 * This is a public demo: anyone can roam the app without signing in. Memphis
 * passkey sign-in is offered in the header (SignOutChip) and prompted only when
 * a visitor wants a persistent human identity. Sign-in attaches a display name;
 * the on-chain caller is the boundary's persisted browser key either way, so
 * reads and role-gated writes resolve against the same identity for guests and
 * signed-in users alike. Same API as every other Thebes example (wrap routes in
 * <MemphisGate>, read the session via useAuth(), sign in / out via SignOutChip);
 * the dark reading-room styling is the only thing specific to Lumen.
 */
import { createContext, useContext, useState, type ReactNode } from 'react'
import { useMemphis, type MemphisAuth } from './useMemphis.js'

const AuthCtx = createContext<MemphisAuth | null>(null)

/** The Memphis session (signed in or guest). Throws if used outside the gate. */
export function useAuth(): MemphisAuth {
  const v = useContext(AuthCtx)
  if (!v) throw new Error('useAuth must be used inside <MemphisGate>')
  return v
}

/** Open demo: always render the app. Sign-in is on demand via SignOutChip.
 *  appName/tagline are accepted for API parity with the gated form but are not
 *  used here — the front door is open. */
export function MemphisGate({ children }: { appName?: string; tagline?: string; children: ReactNode }) {
  const auth = useMemphis()
  return <AuthCtx.Provider value={auth}>{children}</AuthCtx.Provider>
}

/**
 * Header auth control. Guests see a "Sign in" affordance that expands into a
 * name + passkey prompt; signed-in users see their name and a sign-out link.
 * Styled for Lumen's dark reading room (cyan --color-act accent).
 */
export function SignOutChip({ className = '' }: { className?: string }) {
  const auth = useAuth()
  const [name, setName] = useState('')
  const [open, setOpen] = useState(false)

  if (auth.signedIn) return (
    <span className={`inline-flex items-center gap-2 text-xs ${className}`}>
      <span className="text-ink-soft">{auth.displayName}</span>
      <button className="rounded-md px-2 py-1 font-medium text-[var(--color-act)] hover:brightness-110"
              onClick={auth.signOut}>Sign out</button>
    </span>
  )

  // Memphis handles look like  <stem>.thebes  — we append ".thebes" so a visitor
  // only types the stem (3–32 chars, a–z 0–9 -). No bare fallback: an invalid
  // stem keeps the button disabled instead of failing with a cryptic error.
  const stem = name.trim().toLowerCase().replace(/\.thebes$/, '')
  const stemOk = stem.length >= 3 && stem.length <= 32 && /^[a-z0-9-]+$/.test(stem) && !stem.startsWith('-') && !stem.endsWith('-')
  const handle = `${stem}.thebes`
  const submit = () => { if (stemOk && !auth.busy) auth.signIn(handle).catch(() => { /* surfaced by auth.error */ }) }

  if (!open) return (
    <button
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--color-act)] ring-1 ring-[var(--color-act)]/40 hover:bg-[var(--color-act)]/10 ${className}`}
      onClick={() => setOpen(true)}
    >Sign in</button>
  )

  return (
    <span className={`inline-flex flex-col items-stretch gap-1 ${className}`}>
      <span className="inline-flex items-center gap-2">
        <input
          className="rounded-lg bg-black/30 px-2.5 py-1.5 text-xs text-ink ring-1 ring-[var(--color-act)]/30 outline-none focus:ring-[var(--color-act)]"
          placeholder="yourname" value={name} autoFocus aria-label="Thebes handle"
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <button
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--color-act-ink)] transition hover:brightness-110 disabled:opacity-50"
          style={{ background: 'var(--color-act)' }} onClick={submit} disabled={auth.busy || !stemOk}>
          {auth.busy ? 'Signing in…' : 'Sign in with passkey'}
        </button>
      </span>
      <span style={{ fontSize: '11px', opacity: 0.7 }}>
        {stem ? <>→ becomes <b>{handle}</b></> : 'pick a handle — we add .thebes'} · 3–32 · a–z 0–9 -
      </span>
      {auth.error && <span className="rounded-md bg-red-500/15 px-2 py-1 text-xs text-red-300">{auth.error}</span>}
    </span>
  )
}
