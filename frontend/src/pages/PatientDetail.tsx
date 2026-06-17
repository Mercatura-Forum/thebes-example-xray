import { useMemo, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { useQuery } from '@thebes/sdk'
import { XRAY_CID, M, idArg, decodePatientHeader, decodeStudyRows, addStudy } from '../lib/xray-api'
import type { LumenCtx } from '../components/Layout'
import { ageFromYear, relTime } from '../lib/config'
import { Button, Spinner, EmptyState, ErrorNote, Field, Input, StatusChip, ReportChip, ModalityBadge } from '../components/ui'

const canAcquire = (role: string) => role === 'owner' || role === 'admin' || role === 'technician'
const MODALITIES = ['XR', 'CT', 'MR', 'US', 'MG'] as const

export function PatientDetail() {
  const { role } = useOutletContext<LumenCtx>()
  const { id = '0' } = useParams()
  const pid = useMemo(() => { try { return BigInt(id) } catch { return 0n } }, [id])
  const arg = useMemo(() => idArg(pid), [pid])

  const head = useQuery(XRAY_CID, M.patient, arg, decodePatientHeader, [String(pid)])
  const studies = useQuery(XRAY_CID, M.studiesForPatient, arg, decodeStudyRows, [String(pid)])

  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ modality: 'XR', bodyPart: '', description: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>()

  async function submit() {
    setBusy(true); setErr(undefined)
    try {
      if (!f.bodyPart.trim()) throw new Error('Body part is required')
      await addStudy(pid, f.modality, f.bodyPart.trim(), f.description.trim())
      setF({ modality: 'XR', bodyPart: '', description: '' }); setOpen(false)
      studies.refetch()
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  if (role === 'none') return <EmptyState title="No access" hint="Your account has no clinical role yet." />
  if (head.loading && !head.data) return <Spinner label="Loading patient" />
  const p = head.data
  if (!p) return <EmptyState title="Patient not found" hint="This record does not exist or is not visible to you." action={<Link to="/patients"><Button variant="ghost">← Patients</Button></Link>} />

  const list = studies.data ?? []

  return (
    <div>
      <Link to="/patients" className="text-sm text-ink-soft hover:text-ink">← Patients</Link>
      <div className="card mt-3 mb-6 flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h1 className="font-display text-2xl font-bold">{p.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-ink-soft">
            <span className="mono">{p.mrn}</span>
            <span>·</span><span>{p.sex === 'F' ? 'Female' : p.sex === 'M' ? 'Male' : 'Other'}</span>
            <span>·</span><span className="nums">{ageFromYear(p.birthYear)} years</span>
            <span>·</span><span>born {String(p.birthYear)}</span>
          </div>
        </div>
        {canAcquire(role) && <Button onClick={() => setOpen((v) => !v)}>{open ? 'Cancel' : 'New study'}</Button>}
      </div>

      {open && canAcquire(role) && (
        <div className="card mb-6 p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Modality">
              <select value={f.modality} onChange={(e) => setF({ ...f, modality: e.target.value })}
                className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-ink outline-none focus:border-[var(--color-act)]">
                {MODALITIES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Body part"><Input value={f.bodyPart} autoFocus onChange={(e) => setF({ ...f, bodyPart: e.target.value })} placeholder="Chest, Head, Knee…" /></Field>
            <Field label="Description"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="protocol / indication" /></Field>
          </div>
          {err && <div className="mt-4"><ErrorNote message={err} /></div>}
          <div className="mt-4 flex justify-end"><Button onClick={submit} disabled={busy}>{busy ? 'Creating…' : 'Create study'}</Button></div>
        </div>
      )}

      <h2 className="mb-3 font-display text-lg font-semibold">Studies</h2>
      {studies.error && <ErrorNote message={studies.error} />}
      {list.length === 0 ? (
        <EmptyState title="No studies" hint={canAcquire(role) ? 'Create the first study for this patient.' : 'No imaging studies on record.'} />
      ) : (
        <div className="grid gap-3">
          {list.map((s) => (
            <Link key={String(s.id)} to={`/study/${s.id}`} className="card flex items-center justify-between gap-4 p-4 transition hover:border-[var(--color-act)]/50">
              <div className="flex items-center gap-3">
                <ModalityBadge modality={s.modality} />
                <div>
                  <div className="font-semibold text-ink">{s.bodyPart}</div>
                  <div className="text-xs text-ink-soft">{s.description || '—'}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="hidden text-xs text-ink-soft nums sm:inline">{String(s.imageCount)} img · {String(s.seriesCount)} ser</span>
                <ReportChip status={s.reportStatus} />
                <StatusChip status={s.status} />
                <span className="hidden text-xs text-ink-soft md:inline">{relTime(s.createdAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
