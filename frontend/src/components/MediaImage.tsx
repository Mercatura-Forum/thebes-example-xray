import { useState } from 'react'
import { mediaUrl } from '@thebes/sdk'
import { MEDIA_CID } from '../lib/config'

/**
 * A study image rendered straight from the Thebes media contract. Scans display
 * on black with object-contain (no crop) and a blur-up reveal on load. An empty
 * path renders a quiet "no image" frame rather than a broken image — a study can
 * exist before its pixels are acquired.
 */
export function MediaImage({
  path,
  alt,
  ratio = '1 / 1',
  className = '',
}: {
  path: string
  alt: string
  ratio?: string
  className?: string
}) {
  const [loaded, setLoaded] = useState(false)
  if (!path) {
    return (
      <div
        className={`media grid place-items-center text-ink-soft/40 ${className}`}
        style={{ aspectRatio: ratio }}
        aria-label={`${alt} — no image acquired`}
      >
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
      </div>
    )
  }
  return (
    <div className={`media ${className}`} style={{ aspectRatio: ratio }}>
      <img
        src={mediaUrl(MEDIA_CID, path)}
        alt={alt}
        loading="lazy"
        decoding="async"
        data-loaded={loaded}
        onLoad={() => setLoaded(true)}
      />
    </div>
  )
}
