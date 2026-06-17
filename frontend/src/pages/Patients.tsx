import { useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { useQuery } from '@thebes/sdk'
import { XRAY_CID, M, pageArgs, decodePatients, decodeNatReplySafe, addPatient } from '../lib/xray-api'
import type { LumenCtx } from '../components/Layout'
import { ageFromYear } from '../lib/config'
import { Button, Spinner, EmptyState, ErrorNote, Field, Input } from '../components/ui'

const canAcquire = (role: string) => role === 'owner' || role === 'admin' || role === 'technician'
const thisYear = new Date().getFullYear()

export function Patients() {
  const { role } = useOutletContext<LumenCtx>()
  const [limit, setLimit] = useState(50)
  const pArgs = useMemo(() => pageArgs(0, limit), [limit])
  const pts = useQuery(XRAY_CID, M.patients, pArgs, decodePatients, [limit])
  const total = useQuery(XRAY_CID, M.patientCount, undefined, decodeNatReplySafe, [])

  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ mrn: '', name: '', sex: 'F', birthYear: '1990' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>()

  async function submit() {
    setBusy(true); setErr(undefined)
    try {
      const yr = parseInt(f.birthYear, 10)
      if (!f.name.trim()) throw new Error('Patient name is required')
      if (!Number.isFinite(yr) || yr < 1900 || yr > thisYear) throw new Error('Enter a valid birth year')
      await addPatient(f.mrn.trim() || `MRN-${Date.now() % 1_000_000}`, f.name.trim(), f.sex, yr)
      setF({ mrn: '', name: '', sex: 'F', birthYear: '1990' }); setOpen(false)
      pts.refetch(); total.refetch()
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  if (role === 'none') {
    return <EmptyState title="No access" hint="Your account has no clinical role yet. An administrator can grant one on the Staff page." />
  }
  if (pts.loading && !pts.data) return <Spinner label="Loading patients" />

  const list = pts.data ?? []
  const totalN = total.data !== undefined ? Number(total.data) : list.length

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Patients</h1>
          <p className="mt-1 text-sm text-ink-soft nums">{totalN} registered</p>
        </div>
        {canAcquire(role) && <Button onClick={() => setOpen((v) => !v)}>{open ? 'Cancel' : 'Register patient'}</Button>}
      </div>

      {open && canAcquire(role) && (
        <div className="card mb-6 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name"><Input value={f.name} autoFocus onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Family Given" /></Field>
            <Field label="MRN"><Input value={f.mrn} onChange={(e) => setF({ ...f, mrn: e.target.value })} placeholder="auto if blank" className="mono" /></Field>
            <Field label="Sex">
              <select value={f.sex} onChange={(e) => setF({ ...f, sex: e.target.value })}
                className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-ink outline-none focus:border-[var(--color-act)]">
                <option value="F">Female</option><option value="M">Male</option><option value="O">Other</option>
              </select>
            </Field>
            <Field label="Birth year"><Input value={f.birthYear} inputMode="numeric" onChange={(e) => setF({ ...f, birthYear: e.target.value })} className="nums" /></Field>
          </div>
          {err && <div className="mt-4"><ErrorNote message={err} /></div>}
          <div className="mt-4 flex justify-end"><Button onClick={submit} disabled={busy}>{busy ? 'Registering…' : 'Register'}</Button></div>
        </div>
      )}

      {pts.error && <ErrorNote message={pts.error} />}

      {list.length === 0 ? (
        <EmptyState title="No patients yet" hint={canAcquire(role) ? 'Register the first patient to begin.' : 'No patients have been registered.'} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((p) => (
              <Link key={String(p.id)} to={`/patient/${p.id}`} className="card p-4 transition hover:border-[var(--color-act)]/50">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-ink">{p.name}</div>
                    <div className="mono text-xs text-ink-soft">{p.mrn}</div>
                  </div>
                  <span className="rounded-md border border-[var(--color-line)] px-2 py-0.5 text-xs text-ink-soft">{p.sex} · {ageFromYear(p.birthYear)}y</span>
                </div>
                <div className="mt-3 text-xs text-ink-soft nums">{String(p.studyCount)} stud{p.studyCount === 1n ? 'y' : 'ies'}</div>
              </Link>
            ))}
          </div>
          {totalN > list.length && (
            <div className="mt-6 flex justify-center">
              <Button variant="ghost" onClick={() => setLimit((l) => l + 50)}>Load more</Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
