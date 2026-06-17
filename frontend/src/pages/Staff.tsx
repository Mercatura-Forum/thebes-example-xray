import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useQuery, identity } from '@thebes/sdk'
import { XRAY_CID, M, decodeStaff, assignRole, revokeRole } from '../lib/xray-api'
import type { LumenCtx } from '../components/Layout'
import { shortPrincipal } from '../lib/config'
import { Button, Spinner, EmptyState, ErrorNote, Field, Input } from '../components/ui'

const ROLES = ['technician', 'radiologist', 'referrer'] as const
const isAdmin = (role: string) => role === 'owner' || role === 'admin'

export function Staff() {
  const { role } = useOutletContext<LumenCtx>()
  const staff = useQuery(XRAY_CID, M.staff, undefined, decodeStaff, [])
  const [who, setWho] = useState('')
  const [r, setR] = useState<string>('technician')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>()
  const [copied, setCopied] = useState(false)

  const me = identity()

  async function grant() {
    setBusy(true); setErr(undefined)
    try {
      const id = who.trim().toLowerCase().replace(/^0x/, '')
      if (!/^[0-9a-f]{56}$/.test(id)) throw new Error('Enter a 56-character account id (hex)')
      await assignRole(id, r)
      setWho(''); staff.refetch()
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  async function revoke(p: string) {
    setBusy(true); setErr(undefined)
    try { await revokeRole(p); staff.refetch() }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  if (!isAdmin(role)) return <EmptyState title="Admins only" hint="Staff and roles are managed by the clinic owner and administrators." />
  if (staff.loading && !staff.data) return <Spinner label="Loading staff" />
  const list = staff.data ?? []

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-2xl font-bold">Staff &amp; roles</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Grant clinical roles by account id. <b>Technicians</b> register patients and acquire images;
        <b> radiologists</b> write and finalize reports; <b>referrers</b> have read-only access.
      </p>

      <div className="panel mt-4 flex items-center justify-between gap-3 p-3 text-sm">
        <div className="min-w-0">
          <span className="text-ink-soft">Your account id</span>
          <div className="mono truncate text-xs text-ink">{me}</div>
        </div>
        <Button variant="ghost" onClick={() => { navigator.clipboard?.writeText(me); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>

      <div className="card mt-4 p-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <Field label="Account id (hex)"><Input value={who} onChange={(e) => setWho(e.target.value)} placeholder="56-char account id" className="mono" /></Field>
          <Field label="Role">
            <select value={r} onChange={(e) => setR(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-ink outline-none focus:border-[var(--color-act)]">
              {ROLES.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </Field>
          <Button onClick={grant} disabled={busy}>Grant</Button>
        </div>
        {err && <div className="mt-4"><ErrorNote message={err} /></div>}
      </div>

      <h2 className="mt-8 mb-3 font-display text-lg font-semibold">Assigned staff <span className="text-ink-soft nums">({list.length})</span></h2>
      {list.length === 0 ? (
        <EmptyState title="No clinical staff yet" hint="Grant a role above to add the first staff member." />
      ) : (
        <div className="grid gap-2">
          {list.map((s) => (
            <div key={s.who} className="card flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="mono truncate text-sm text-ink">{shortPrincipal(s.who)}</div>
                <div className="text-xs capitalize text-[var(--color-act)]">{s.role}</div>
              </div>
              <Button variant="danger" onClick={() => revoke(s.who)} disabled={busy}>Revoke</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
