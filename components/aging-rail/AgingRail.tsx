import Link from 'next/link'
import { BAND_META } from '@/lib/aging'
import { packRail, RAIL_TICKS, SLOTS_PER_COLUMN } from '@/lib/rail'
import type { InvoiceListItem } from '@/lib/types'
import styles from './AgingRail.module.css'

/**
 * The Aging Rail (§3).
 *
 * Every open invoice is a mark on a four-band scale, positioned by days since
 * due and sized by amount. Colour comes from the aging scale, so the rail
 * reads mint-to-oxblood left to right without any gradient existing anywhere
 * in the CSS — the bleed is emergent from the chips themselves (PHASE-0 §7.3).
 *
 * A server component: no client JavaScript at all.
 */

const CHIP_MIN_PX = 14
const CHIP_RANGE_PX = 52

export function AgingRail({ invoices }: { invoices: InvoiceListItem[] }) {
  const columns = packRail(invoices)
  const total = columns.reduce((n, c) => n + c.placed.length + c.overflow.length, 0)

  let chipIndex = 0

  return (
    <section className={styles.rail} aria-labelledby="aging-rail-heading">
      <div className={styles.head}>
        <h2 id="aging-rail-heading" className="micro" style={{ margin: 0 }}>
          Aging rail
        </h2>
        <span className="micro">
          {total === 0 ? 'nothing open' : `${total} open ${total === 1 ? 'invoice' : 'invoices'}`}
        </span>
      </div>

      {total === 0 ? (
        <div className={styles.empty}>
          <p>Nothing open. Every invoice you have entered is paid.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {columns.map((column) => (
            <div key={column.column} className={styles.column}>
              <div className={styles.colHead}>
                <span className={styles.colLabel}>{column.label}</span>
                <span className={styles.colCount}>
                  {column.placed.length + column.overflow.length}
                </span>
              </div>

              <div className={styles.plot}>
                {column.placed.map(({ item, slot, scale }) => {
                  const meta = BAND_META[item.band]
                  const delay = chipIndex++ * 18
                  const anchor =
                    slot <= 3 ? 'left' : slot >= SLOTS_PER_COLUMN - 4 ? 'right' : 'center'

                  return (
                    <Link
                      key={item.id}
                      href={`/invoices/${item.id}`}
                      className={styles.chip}
                      style={
                        {
                          left: `${((slot + 0.5) / SLOTS_PER_COLUMN) * 100}%`,
                          '--chip-height': `${CHIP_MIN_PX + scale * CHIP_RANGE_PX}px`,
                          '--chip-fill': meta.fill,
                          '--chip-text': meta.text,
                          '--chip-delay': `${delay}ms`,
                        } as React.CSSProperties
                      }
                      aria-label={`Invoice ${item.invoiceNumber}, ${item.clientName}, ${item.amountLabel}, ${item.agingPhrase}`}
                    >
                      <span className={styles.card} data-anchor={anchor} aria-hidden="true">
                        <span className={styles.cardTitle}>
                          {item.invoiceNumber} · {item.clientName}
                        </span>
                        <span className={styles.cardAmount}>{item.amountLabel}</span>
                        <span className={styles.cardMeta}>
                          due {item.dueLabel} · {item.agingPhrase}
                        </span>
                        <span className={styles.cardBand}>{meta.label}</span>
                        <span className={styles.cardNote}>
                          No chases yet — the sequence arrives in Phase 2.
                        </span>
                      </span>
                    </Link>
                  )
                })}

                {column.overflow.length > 0 && (
                  <Link
                    href={`/invoices?band=${column.column}`}
                    className={styles.cluster}
                    aria-label={`${column.overflow.length} more invoices in ${column.label}`}
                  >
                    +{column.overflow.length}
                  </Link>
                )}
              </div>

              <div className={styles.axis}>
                {(RAIL_TICKS[column.column] ?? []).map((tick) => (
                  <span key={tick}>{tick}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
