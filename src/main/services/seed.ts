import type { UnitOfWork } from './ports'

/**
 * Seed static settings into a fresh DB — ADR-018 §4.
 *
 * Only sets a key if it is absent (idempotent). All values are JSON strings
 * (ADR-018 §5 — scalars are JSON too).
 *
 * NOTE: `last_settled_week` bootstrap is M3's responsibility (weekly-review),
 * not seeded here. Leave that computed value to be established on first review.
 */
export function seedSettings(uow: UnitOfWork): void {
  const STATIC_SEEDS: Record<string, string> = {
    focus_min: '25',
    short_break_min: '5',
    long_break_min: '15',
    plan_lead_days: '1',
    // 'dark' — the app owns the theme and does not follow the OS (design-system ADR-010 §1).
    // Existing databases still hold '"system"'; readTheme() normalises and rewrites those,
    // because seeding is idempotent and never overwrites a key that is already present.
    theme: '"dark"'
    // NOTE: weekly_capacity and last_settled_week are NOT seeded here.
  }

  uow.run((repos) => {
    for (const [key, value] of Object.entries(STATIC_SEEDS)) {
      const existing = repos.settings.get(key)
      if (existing === null) {
        repos.settings.set(key, value)
      }
    }
  })
}
