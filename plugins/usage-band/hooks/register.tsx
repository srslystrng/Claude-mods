import { atom, read, update } from 'claude-code'
import type { Register, SessionRateLimit } from 'claude-code'

import type { Reply } from '../types'

// Prompt-cache lifetime this session's requests use (cloud sessions: 1 hour).
const CACHE_TTL_MS = 60 * 60 * 1000

// List prices, $ per million tokens. Cache write is the 1h rate (2x input).
const MODELS = [
  { name: 'Fable', match: 'fable', input: 10, read: 0.25 },
  { name: 'Opus', match: 'opus', input: 4, read: 0.2 },
  { name: 'Sonnet', match: 'sonnet', input: 2, read: 0.2 },
  { name: 'Haiku', match: 'haiku', input: 0.1, read: 0.01 },
] as const

const lastReply = atom({ plugin: 'usage-band', key: 'lastReply' } as const, null)
const isHidden = atom({ plugin: 'usage-band', key: 'isHidden' } as const, false)
const now = atom({ plugin: 'usage-band', key: 'now' } as const, 0)

const usd = (n: number) => (n < 0.01 ? '<$0.01' : `$${n.toFixed(2)}`)
const kTokens = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`)

const untilText = (iso: string | undefined, at: number) => {
  if (!iso) return ''
  const mins = Math.max(0, Math.round((Date.parse(iso) - at) / 60000))
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`
}

const pctColor = (left: number) => (left < 15 ? '#e5484d' : left < 40 ? '#f2a33a' : '#46a758')

const bar = (fraction: number, width = 10) => {
  const filled = Math.round(Math.min(1, Math.max(0, fraction)) * width)
  return '●'.repeat(filled) + '·'.repeat(width - filled)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'usage-band',
      description: 'Show or hide the usage band above the prompt',
    })
    await update($, now, () => Date.now())
    // Redraw every 30 s so the cache countdown keeps moving.
    $.clock.every(30_000, () => void update($, now, () => Date.now()))

    return next(e)
  })

  on('command.run', { command: 'usage-band' }, async $ => {
    const hidden = await update($, isHidden, v => !v)
    return { text: hidden ? 'Usage band hidden.' : 'Usage band shown.' }
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const { context } = await $.session.usage()
    const model = await $.session.model()
    const at = await $.clock.now()
    if (context.tokens) {
      await update($, lastReply, () => ({ at, tokens: context.tokens ?? 0, model }))
    }
    await update($, now, () => at)

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) return next(e)

    const { Box, Text, Button } = $.ui.resolve(e)
    const at = (await read($, now)) || Date.now()
    const reply = await read($, lastReply)
    const usage = await $.session.usage()
    const model = (reply?.model ?? (await $.session.model())).toLowerCase()

    const limit = (kind: string, label: string) => {
      const w = usage.rateLimits.find((r: SessionRateLimit) => r.kind === kind)
      if (!w) return null
      const left = Math.max(0, Math.round(100 - w.percentUsed))
      return (
        <Text>
          <Text weight="bold">{label} </Text>
          <Text color={pctColor(left)}>
            {bar(left / 100)} {left}% left
          </Text>
          <Text dimColor> · {untilText(w.resetsAt, at)}</Text>
          {'   '}
        </Text>
      )
    }

    const tokens = usage.context.tokens ?? reply?.tokens ?? 0
    const idleMs = reply ? at - reply.at : 0
    const isWarm = reply !== null && idleMs < CACHE_TTL_MS
    const coldIn = Math.max(0, Math.round((CACHE_TTL_MS - idleMs) / 60000))
    const pct = usage.context.window ? (tokens / usage.context.window) * 100 : 0

    return (
      <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text>
            <Text weight="bold">USAGE </Text>
            {limit('seven_day', '7D')}
            {limit('five_hour', '5H')}
            {usage.rateLimits.length === 0 && <Text dimColor>limits appear after the next reply</Text>}
          </Text>
          <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />
        </Box>
        <Box flexDirection="row" columnGap={3} flexWrap="wrap">
          <Text>
            <Text color={isWarm ? '#f2a33a' : '#6e9ef5'} weight="bold">
              {reply === null ? 'NO CACHE' : isWarm ? 'WARM' : 'COLD'}
            </Text>
            <Text dimColor> idle </Text>
            <Text weight="bold">{reply ? `${Math.round(idleMs / 60000)}m` : '–'}</Text>
            <Text dimColor>{isWarm ? ` · cold in ${coldIn}m` : reply ? ' · next reply re-caches' : ''}</Text>
          </Text>
          <Text>
            <Text dimColor>in cache </Text>
            <Text weight="bold">{kTokens(tokens)}</Text>
            <Text dimColor> tokens · {pct.toFixed(0)}% of context</Text>
          </Text>
        </Box>
        <Text>
          <Text dimColor>next message: </Text>
          {MODELS.map(m => {
            const isYou = model.includes(m.match)
            // Same model + warm cache: cache-read rate. Otherwise the whole
            // context is written to cache again at the 1h rate (2x input).
            const cost = (tokens / 1e6) * (isYou && isWarm ? m.read : m.input * 2)
            return (
              <Text>
                <Text weight={isYou ? 'bold' : 'regular'} color={isYou ? '#e8825a' : undefined} dimColor={!isYou}>
                  {m.name}
                  {isYou ? ' (you)' : ''} {usd(cost)}
                </Text>
                {'   '}
              </Text>
            )
          })}
        </Text>
      </Box>
    )
  })
}
