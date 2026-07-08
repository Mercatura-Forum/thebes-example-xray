/** Contract ids — injected at deploy via window globals; fallback 0 until then
 *  (the backend cid is assigned at deploy; the media cid is its own instance). */
declare global {
  interface Window {
    XRAY_CID?: number
    MEDIA_CID?: number
  }
}

export const XRAY_CID: number = (typeof window !== 'undefined' && window.XRAY_CID) || 0
export const MEDIA_CID: number = (typeof window !== 'undefined' && window.MEDIA_CID) || 0

import { wallDate } from './chainTime'

/** Relative time for a CHAIN ns timestamp (ns since genesis — calibrated). */
export function relTime(ns: bigint): string {
  const ms = wallDate(ns).getTime()
  const diff = Date.now() - ms
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Approximate age from a birth year (the demo stores year only, like a redacted DOB). */
export function ageFromYear(birthYear: number | bigint): number {
  const y = typeof birthYear === 'bigint' ? Number(birthYear) : birthYear
  return Math.max(0, new Date().getFullYear() - y)
}

/** Short principal for display (first·last segments). */
export function shortPrincipal(p: string): string {
  if (p.length <= 13) return p
  return `${p.slice(0, 5)}…${p.slice(-5)}`
}
