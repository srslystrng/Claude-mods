import type { Register } from 'claude-code'

const THRESHOLDS = [80, 95]
const LABELS: Record<string, string> = { five_hour: '5-hour', seven_day: '7-day' }

export const register: Register = on => {
  // One alert per window, threshold and reset, so it never repeats.
  const alerted = new Set<string>()

  on('session.measure', async ($, e, next) => {
    for (const w of e.rateLimits) {
      const passed = THRESHOLDS.filter(t => w.percentUsed >= t).pop()
      if (passed === undefined) continue
      const id = `${w.kind}:${passed}:${w.resetsAt ?? ''}`
      if (alerted.has(id)) continue
      alerted.add(id)
      const label = LABELS[w.kind] ?? w.kind
      const advice = passed >= 95 ? 'Switch to Haiku or wait for the reset.' : 'Consider Sonnet for routine work.'
      $.ui.toast(`${label} limit at ${Math.round(w.percentUsed)}%. ${advice}`, { timeoutMs: 15_000 })
    }
    return next(e)
  })
}
