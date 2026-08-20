import { BAND_META, type AgingBand } from '@/lib/aging'

/**
 * The aging scale in a text context. Colour is a mark, never the type itself
 * (D-011) — the label always carries the meaning on its own.
 */
export function AgingPill({ band, children }: { band: AgingBand; children?: React.ReactNode }) {
  const meta = BAND_META[band]
  return (
    <span
      className="pill"
      style={{ ['--pill-fill' as string]: meta.fill, color: meta.text }}
    >
      {children ?? meta.label}
    </span>
  )
}
