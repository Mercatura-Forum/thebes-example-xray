import { useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { useQuery } from '@thebes/sdk'
import { XRAY_CID, M, M2, pageArgs, decodeWorklist, decodeBoard, seedDemo, type BoardRow } from '../lib/xray-api'
import type { LumenCtx } from '../components/Layout'
import { relTime } from '../lib/config'
import { useCalibrated } from '../lib/useCalibrated'
import { Button, Spinner, EmptyState, ErrorNote, StatusChip, ReportChip, ModalityBadge } from '../components/ui'

const STATUSES = ['scheduled', 'acquired', 'reported'] as const

/** The board: a PACS status wall — one glowing cell per modality × pipeline
 *  stage, live from the chain. The reading room's heartbeat at a glance. */
function ModalityWall({ rows }: { rows: BoardRow[] }) {
  if (rows.length === 0) return null
  const max = Math.max(...rows.flatMap((r) => [Number(r.scheduled), Number(r.acquired), Number(r.reported)]), 1)
  return (
    <section className="wall" data-testid="modality-wall">
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `5rem repeat(${STATUSES.length}, 1fr)` }}>
        <span />
        {STATUSES.map((st) => (
          <span key={st} className="text-center text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: `var(--st-${st})` }}>{st}</span>
        ))}
        {rows.map((r) => (
          [
            <span key={r.modality} className="self-center font-mono text-sm font-bold text-ink">{r.modality}</span>,
            ...STATUSES.map((st) => {
              const n = Number(r[st])
              return (
                <div key={r.modality + st} className="wall-cell nums" style={{
                  ['--cell' as string]: `var(--st-${st})`,
                  opacity: n === 0 ? 0.25 : 0.55 + 0.45 * (n / max),
                }}>
                  {n}
                </div>
              )
            }),
          ]
        ))}
      </div>
    </section>
  )
}

export function Worklist() {
  const { role, refetchRole } = useOutletContext<LumenCtx>()
  // Timestamps render through the chain-clock calibration, which lands async —
  // re-derive the list when it does.
  const cal = useCalibrated()
  const wl = useQuery(XRAY_CID, M.worklist, pageArgs(0, 200), decodeWorklist, [cal ? 1 : 0])
  const board = useQuery<BoardRow[]>(XRAY_CID, M2.board, undefined, decodeBoard, [])
  const [seeding, setSeeding] = useState(false)
  const [notice, setNotice] = useState<string>()

  async function runSeed() {
    setSeeding(true); setNotice(undefined)
    try {
      const created = await seedDemo()
      refetchRole(); wl.refetch()
      if (!created) setNotice('This clinic is already set up. Ask an administrator to grant your account a clinical role on the Staff page.')
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
    } finally { setSeeding(false) }
  }

  if (wl.loading && !wl.data) return <Spinner label="Loading worklist" />

  const studies = wl.data ?? []

  // A caller with no role sees no patient data — the privacy model. Offer the
  // one-time clinic setup (which claims ownership for the first signed-in user).
  if (role === 'none') {
    return (
      <div className="mx-auto max-w-lg">
        <div className="card p-8 text-center">
          <h1 className="font-display text-2xl font-bold">Reading room</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Lumen is access-controlled: patient studies are visible to clinical staff only.
            Set up this clinic to claim ownership and load a small demo worklist, or ask an
            administrator to grant your account a role.
          </p>
          <Button className="mt-5" onClick={runSeed} disabled={seeding}>
            {seeding ? 'Setting up…' : 'Set up clinic with demo data'}
          </Button>
          {notice && <div className="mt-4"><ErrorNote message={notice} /></div>}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Worklist</h1>
          <p className="mt-1 text-sm text-ink-soft">Recent imaging studies across all patients, newest first.</p>
        </div>
        <Link to="/patients"><Button variant="ghost">Patients →</Button></Link>
      </div>

      <ModalityWall rows={board.data ?? []} />

      {wl.error && <ErrorNote message={wl.error} />}

      {studies.length === 0 ? (
        <EmptyState
          title="No studies yet"
          hint="Register a patient and create their first study to populate the worklist."
          action={
            <div className="flex gap-2">
              <Link to="/patients"><Button>Register a patient</Button></Link>
              {(role === 'owner' || role === 'admin') && (
                <Button variant="ghost" onClick={runSeed} disabled={seeding}>{seeding ? 'Loading…' : 'Load demo data'}</Button>
              )}
            </div>
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-line)] text-left text-xs uppercase tracking-wide text-ink-soft">
                <th className="px-4 py-3 font-semibold">Patient</th>
                <th className="px-4 py-3 font-semibold">Study</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Report</th>
                <th className="px-4 py-3 text-right font-semibold">Images</th>
                <th className="px-4 py-3 text-right font-semibold">Created</th>
              </tr>
            </thead>
            <tbody>
              {studies.map((s) => (
                <tr key={String(s.studyId)} className="group border-b border-[var(--color-line)]/60 last:border-0 hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <Link to={`/study/${s.studyId}`} className="block">
                      <div className="font-semibold text-ink group-hover:text-[var(--color-act)]">{s.patientName}</div>
                      <div className="mono text-xs text-ink-soft">{s.mrn}</div>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <ModalityBadge modality={s.modality} />
                      <span className="text-ink">{s.bodyPart}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3"><StatusChip status={s.status} /></td>
                  <td className="px-4 py-3"><ReportChip status={s.reportStatus} /></td>
                  <td className="px-4 py-3 text-right nums text-ink-soft">{String(s.imageCount)}</td>
                  <td className="px-4 py-3 text-right text-xs text-ink-soft">{relTime(s.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
