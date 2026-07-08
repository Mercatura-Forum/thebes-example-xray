import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { SignOutChip, useQuery } from '@thebes/sdk'
import { XRAY_CID, M, M2, decodeRole, decodeSeal, calibrateChainClock, type SealRow } from '../lib/xray-api'

function LumenSeal() {
  const { data } = useQuery<SealRow>(XRAY_CID, M2.seal, undefined, decodeSeal)
  if (!data) return null
  const ok = Number(data.violations) === 0
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 nums text-[11px]" data-testid="lumen-seal">
      <span className={`inline-block h-2 w-2 rounded-full ${ok ? 'bg-[var(--st-reported)]' : 'bg-red-500'}`} />
      {ok ? (
        <span className="text-ink-soft">
          <b className="text-ink">The archive re-proves itself on every read</b> · {data.patients.toString()} patients ·{' '}
          {data.studies.toString()} studies · {data.images.toString()} images · {data.reportsFinal.toString()} final +{' '}
          {data.reportsDraft.toString()} draft reports · {data.accessEvents.toString()} access events, gap-free · 0 violations across 5 laws
        </span>
      ) : (
        <span className="font-semibold text-red-400">The oracle reports {data.violations.toString()} violation(s).</span>
      )}
    </div>
  )
}

/** Shared route context: the caller's effective role + a way to refresh it. */
export interface LumenCtx { role: string; refetchRole: () => void }

const isAdmin = (role: string) => role === 'owner' || role === 'admin'

export function Layout() {
  useEffect(() => { calibrateChainClock().catch(() => {}) }, [])
  const roleQ = useQuery(XRAY_CID, M.myRole, undefined, decodeRole, [])
  const role = roleQ.data ?? 'none'
  const ctx: LumenCtx = { role, refetchRole: roleQ.refetch }

  const tabs = [
    { to: '/', label: 'Worklist', end: true, show: true },
    { to: '/patients', label: 'Patients', end: false, show: true },
    { to: '/staff', label: 'Staff', end: false, show: isAdmin(role) },
    { to: '/audit', label: 'Access log', end: false, show: isAdmin(role) },
  ].filter((t) => t.show)

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-[var(--color-line)] bg-paper/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <NavLink to="/" className="flex items-center gap-2 font-display text-2xl font-extrabold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--color-act)]/15 text-[var(--color-act)]">◎</span>
            lumen
          </NavLink>
          <nav className="flex items-center gap-1">
            {tabs.map((t) => (
              <NavLink key={t.to} to={t.to} end={t.end}
                className={({ isActive }) => `rounded-lg px-3 py-1.5 text-sm font-semibold transition ${isActive ? 'bg-[var(--color-act)]/12 text-[var(--color-act)]' : 'text-ink-soft hover:text-ink'}`}>
                {t.label}
              </NavLink>
            ))}
            {role !== 'none' && (
              <span className="ml-2 hidden rounded-md border border-[var(--color-line)] px-2 py-0.5 text-xs font-medium capitalize text-ink-soft sm:inline">{role}</span>
            )}
            <SignOutChip className="ml-2 border-l border-[var(--color-line)] pl-3" />
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8"><Outlet context={ctx} /></main>
      <footer className="mx-auto w-full max-w-6xl px-5 py-8 text-xs text-ink-soft">
        <p>
          Lumen — a teaching example for Thebes Protocol. Patient records, studies, and
          diagnostic reports live on the chain; image pixels live in the Thebes media
          contract. Records are visible to clinical staff only, and every opened study
          is written to an immutable, gap-free access log.
        </p>
        <LumenSeal />
      </footer>
    </div>
  )
}
