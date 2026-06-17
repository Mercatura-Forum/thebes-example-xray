import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { useQuery, useMediaUpload } from '@thebes/sdk'
import {
  XRAY_CID, M, idArg, decodeStudyDetail, decodeSeries, decodeImages,
  openStudy, addSeries, addImage, saveReport, finalizeReport,
} from '../lib/xray-api'
import type { ImageRow } from '../lib/xray-api'
import { MEDIA_CID, relTime } from '../lib/config'
import type { LumenCtx } from '../components/Layout'
import { MediaImage } from '../components/MediaImage'
import { Button, Spinner, EmptyState, ErrorNote, Field, Input, Textarea, StatusChip, ReportChip, ModalityBadge } from '../components/ui'

const canAcquire = (role: string) => role === 'owner' || role === 'admin' || role === 'technician'
const canReport = (role: string) => role === 'owner' || role === 'admin' || role === 'radiologist'

export function Study() {
  const { role } = useOutletContext<LumenCtx>()
  const { id = '0' } = useParams()
  const sid = useMemo(() => { try { return BigInt(id) } catch { return 0n } }, [id])
  const arg = useMemo(() => idArg(sid), [sid])

  const study = useQuery(XRAY_CID, M.study, arg, decodeStudyDetail, [String(sid)])
  const series = useQuery(XRAY_CID, M.seriesForStudy, arg, decodeSeries, [String(sid)])
  const images = useQuery(XRAY_CID, M.studyImages, arg, decodeImages, [String(sid)])

  // Opening a study is an audited access event (logged server-side, once).
  const logged = useRef('')
  useEffect(() => {
    if (role === 'none' || logged.current === String(sid)) return
    logged.current = String(sid)
    openStudy(sid).catch(() => { /* viewing still works; the log is best-effort */ })
  }, [sid, role])

  if (role === 'none') return <EmptyState title="No access" hint="Your account has no clinical role yet." />
  if (study.loading && !study.data) return <Spinner label="Loading study" />
  const st = study.data
  if (!st) return <EmptyState title="Study not found" hint="This study does not exist or is not visible to you." action={<Link to="/"><Button variant="ghost">← Worklist</Button></Link>} />

  const imgs = images.data ?? []
  const refetchAll = () => { study.refetch(); series.refetch(); images.refetch() }

  return (
    <div>
      <Link to={`/patient/${st.patientId}`} className="text-sm text-ink-soft hover:text-ink">← {st.patientName}</Link>
      <div className="mt-3 mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ModalityBadge modality={st.modality} />
          <div>
            <h1 className="font-display text-2xl font-bold">{st.bodyPart}</h1>
            <div className="text-sm text-ink-soft">{st.description || '—'} · <span className="mono">{st.mrn}</span></div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ReportChip status={st.reportStatus} />
          <StatusChip status={st.status} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Viewer */}
        <section className="lg:col-span-3">
          <Viewer imgs={imgs} />
          {canAcquire(role) && (
            <Acquire studyId={sid} seriesList={series.data ?? []} imageCount={imgs.length} onDone={refetchAll} />
          )}
        </section>

        {/* Report */}
        <section className="lg:col-span-2">
          <Report
            studyId={sid}
            status={st.status}
            reportStatus={st.reportStatus}
            findings={st.reportFindings}
            impression={st.reportImpression}
            canReport={canReport(role)}
            onDone={refetchAll}
          />
        </section>
      </div>
    </div>
  )
}

function Viewer({ imgs }: { imgs: ImageRow[] }) {
  const [sel, setSel] = useState(0)
  const current = imgs[Math.min(sel, Math.max(0, imgs.length - 1))]
  if (imgs.length === 0) {
    return (
      <div className="card p-4">
        <MediaImage path="" alt="No images" ratio="4 / 3" />
        <p className="mt-3 text-center text-sm text-ink-soft">No images acquired yet.</p>
      </div>
    )
  }
  return (
    <div className="card p-4">
      <MediaImage path={current.imagePath} alt={`series ${current.seriesId} · instance ${current.instanceNumber}`} ratio="4 / 3" />
      <div className="mt-2 flex items-center justify-between text-xs text-ink-soft">
        <span className="mono">series {String(current.seriesId)} · #{String(current.instanceNumber)}</span>
        <span>{relTime(current.createdAt)}</span>
      </div>
      {imgs.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {imgs.map((im, idx) => (
            <button key={String(im.id)} onClick={() => setSel(idx)}
              className={`shrink-0 overflow-hidden rounded-md border-2 ${idx === sel ? 'border-[var(--color-act)]' : 'border-transparent opacity-70 hover:opacity-100'}`}
              style={{ width: 64 }} aria-label={`image ${idx + 1}`}>
              <MediaImage path={im.imagePath} alt={`thumb ${idx + 1}`} ratio="1 / 1" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Acquire({ studyId, seriesList, imageCount, onDone }: {
  studyId: bigint
  seriesList: { id: bigint; description: string; imageCount: bigint }[]
  imageCount: number
  onDone: () => void
}) {
  const media = useMediaUpload(MEDIA_CID)
  const fileRef = useRef<HTMLInputElement>(null)
  const [seriesId, setSeriesId] = useState<string>('')
  const [newSeries, setNewSeries] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>()
  const [ok, setOk] = useState<string>()

  // Default the series selector to the first existing series.
  useEffect(() => {
    if (!seriesId && seriesList.length > 0) setSeriesId(String(seriesList[0].id))
  }, [seriesList, seriesId])

  async function createSeries() {
    setBusy(true); setErr(undefined); setOk(undefined)
    try {
      const newId = await addSeries(studyId, newSeries.trim() || `Series ${seriesList.length + 1}`)
      setNewSeries(''); setSeriesId(String(newId)); onDone()
      setOk('Series added.')
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  async function upload(file: File | undefined) {
    if (!file) return
    if (!seriesId) { setErr('Add a series first, then upload into it.'); return }
    setErr(undefined); setOk(undefined); setBusy(true)
    try {
      const { path } = await media.upload(file, 'photo')        // bytes → media contract
      await addImage(BigInt(seriesId), path, imageCount + 1)     // path → study image
      if (fileRef.current) fileRef.current.value = ''
      onDone(); setOk('Image stored on-chain ✓')
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  return (
    <div className="panel mt-4 p-4">
      <h3 className="font-display text-sm font-semibold text-ink">Acquire</h3>
      <p className="mt-1 text-xs text-ink-soft">Image bytes go to the Thebes media contract; the study stores only the returned path.</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Series">
          {seriesList.length === 0 ? (
            <p className="text-xs text-ink-soft">No series yet — create one →</p>
          ) : (
            <select value={seriesId} onChange={(e) => setSeriesId(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm text-ink outline-none focus:border-[var(--color-act)]">
              {seriesList.map((s) => <option key={String(s.id)} value={String(s.id)}>{s.description} ({String(s.imageCount)})</option>)}
            </select>
          )}
        </Field>
        <Field label="New series">
          <div className="flex gap-2">
            <Input value={newSeries} onChange={(e) => setNewSeries(e.target.value)} placeholder="Axial 5mm…" />
            <Button variant="ghost" onClick={createSeries} disabled={busy}>Add</Button>
          </div>
        </Field>
      </div>

      <div className="mt-3">
        <input ref={fileRef} type="file" accept="image/*" disabled={busy || !seriesId}
          onChange={(e) => upload(e.target.files?.[0])}
          className="block w-full text-sm text-ink-soft file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--color-act)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[var(--color-act-ink)] disabled:opacity-50" />
        {media.busy && <p className="mt-2 text-xs text-ink-soft nums">Uploading… {Math.round(media.progress * 100)}%</p>}
        {ok && !media.busy && <p className="mt-2 text-xs text-[var(--st-reported)]">{ok}</p>}
        {err && <div className="mt-2"><ErrorNote message={err} /></div>}
      </div>
    </div>
  )
}

function Report({ studyId, status, reportStatus, findings, impression, canReport, onDone }: {
  studyId: bigint; status: string; reportStatus: string; findings: string; impression: string; canReport: boolean; onDone: () => void
}) {
  const [f, setF] = useState(findings)
  const [imp, setImp] = useState(impression)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>()
  const isFinal = reportStatus === 'final'

  // Sync local editor when the server record changes (e.g. after refetch).
  useEffect(() => { setF(findings); setImp(impression) }, [findings, impression])

  async function save(finalize: boolean) {
    setBusy(true); setErr(undefined)
    try {
      await saveReport(studyId, f.trim(), imp.trim())
      if (finalize) await finalizeReport(studyId)
      onDone()
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  const locked = isFinal || !canReport
  const noImages = status === 'scheduled'

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-ink-soft">Diagnostic report</h3>
        <ReportChip status={reportStatus} />
      </div>

      {!canReport && reportStatus === 'none' && (
        <p className="text-sm text-ink-soft">No report yet. A radiologist will read this study.</p>
      )}

      {(canReport || reportStatus !== 'none') && (
        <div className="space-y-4">
          <Field label="Findings">
            <Textarea rows={5} value={f} onChange={(e) => setF(e.target.value)} disabled={locked} placeholder="Describe the imaging findings…" />
          </Field>
          <Field label="Impression">
            <Textarea rows={3} value={imp} onChange={(e) => setImp(e.target.value)} disabled={locked} placeholder="Summary / recommendation…" />
          </Field>
        </div>
      )}

      {err && <div className="mt-3"><ErrorNote message={err} /></div>}

      {canReport && !isFinal && (
        <div className="mt-4 flex items-center justify-end gap-2">
          {noImages
            ? <p className="text-xs text-ink-soft">Acquire an image before reporting.</p>
            : <>
                <Button variant="ghost" onClick={() => save(false)} disabled={busy}>{busy ? 'Saving…' : 'Save draft'}</Button>
                <Button onClick={() => save(true)} disabled={busy}>Finalize</Button>
              </>}
        </div>
      )}
      {isFinal && <p className="mt-4 text-xs text-[var(--st-reported)]">Report finalized — locked for editing.</p>}
    </div>
  )
}
