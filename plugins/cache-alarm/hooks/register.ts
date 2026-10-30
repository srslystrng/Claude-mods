import type { Register, Timer } from 'claude-code'

// Prompt-cache lifetime this session's requests use (cloud sessions: 1 hour).
const CACHE_TTL_MIN = 60
const WARN_AT_MIN = 50

export const register: Register = on => {
  let timer: Timer | undefined

  on('prompt.submit', ($, e, next) => {
    timer?.cancel()
    timer = undefined
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    timer?.cancel()
    timer = $.clock.after(WARN_AT_MIN * 60_000, () => {
      $.ui.toast(
        `Prompt cache goes cold in ${CACHE_TTL_MIN - WARN_AT_MIN}m. Send now to keep the next message cheap.`,
        { timeoutMs: 60_000 },
      )
    })
    return result
  })
}
