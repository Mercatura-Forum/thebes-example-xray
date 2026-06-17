import { useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { useQuery } from '@thebes/sdk'
import { XRAY_CID, M, pageArgs, decodeAccess, decodeNatReplySafe } from '../lib/xray-api'
import type { LumenCtx } from '../components/Layout'
import { relTime, shortPrincipal } from '../lib/config'
import { Button, Spinner, EmptyState, ErrorNote } from '../components/ui'

const isAdmin = (role: string) => role === 'owner' || role === 'admin'

export function AccessLog() {
  const { role } = useOutletContext<LumenCtx>()
  const [limit, setLimit] = useState(100)
  const args = useMemo(() => pageArgs(0, limit), [limit])
  const log = useQuery(XRAY_CID, M.accessLog, args, decodeAccess, [limit])
  const total = useQuery(XRAY_CID, M.accessLogCount, undefined, decodeNatReplySafe, [])

  if (!isAdmin(role)) return <EmptyState title="Admins only" hint="The access log is visible to the clinic owner and administrators." />
  if (log.loading && !log.data) return <Spinner label="Loading access log" />
  const rows = log.data ?? []
  const totalN = total.data !== undefined ? Number(total.data) : rows.length

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">Access log</h1>
      <p className="mt-1 text-sm text-ink-soft nums">{totalN} events · immutable, append-only — every opened study is recorded here.</p>
      {log.error && <ErrorNote message={log.error} />}

      {rows.length === 0 ? (
        <EmptyState title="No access events yet" hint="Opening a study from the worklist records an entry here." />
      ) : (
        <div className="card mt-5 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-line)] text-left text-xs uppercase tracking-wide text-ink-soft">
                <th className="px-4 py-3 font-semibold">When</th>
                <th className="px-4 py-3 font-semibold">Account</th>
                <th className="px-4 py-3 font-semibold">Action</th>
                <th className="px-4 py-3 font-semibold">Study</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={String(e.id)} className="border-b border-[var(--color-line)]/60 last:border-0">
                  <td className="px-4 py-3 text-ink-soft">{relTime(e.at)}</td>
                  <td className="px-4 py-3 mono text-xs text-ink">{shortPrincipal(e.who)}</td>
                  <td className="px-4 py-3 capitalize text-ink">{e.action}</td>
                  <td className="px-4 py-3"><Link to={`/study/${e.studyId}`} className="text-[var(--color-act)] hover:underline">#{String(e.studyId)}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalN > rows.length && (
        <div className="mt-6 flex justify-center"><Button variant="ghost" onClick={() => setLimit((l) => l + 100)}>Load more</Button></div>
      )}
    </div>
  )
}
