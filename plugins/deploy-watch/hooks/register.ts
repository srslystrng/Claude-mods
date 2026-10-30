import type { EngineInterface, Register, Timer } from 'claude-code'

// Repo (matched against the git remote) -> public endpoint naming the live build.
const SITES = [
  {
    repo: 'sst-coaching-connector',
    url: 'https://sst-coaching-connector.keith-5e5.workers.dev/app/api/version',
    name: 'SST Staff App',
  },
]
const POLL_MS = 60_000
const GIVE_UP_MS = 25 * 60_000

const liveBuild = async ($: EngineInterface, url: string) => {
  try {
    const r = await $.http.fetch(url)
    if (!r.ok) return null
    return String((JSON.parse(r.text) as { build?: string }).build ?? '') || null
  } catch {
    return null
  }
}

const unquote = (s: string) => s.replace(/^["']|["']$/g, '')

// The `git push` the command runs, if any: a statement that starts with git
// (not text that merely mentions it), with the folder from a `cd` before it
// or its own `-C`.
const findPush = (command: string) => {
  let dir: string | undefined
  for (const part of command.split(/\n|&&|\|\||;/)) {
    const s = part.trim()
    const cd = /^cd\s+("[^"]+"|'[^']+'|\S+)$/.exec(s)
    if (cd?.[1]) dir = unquote(cd[1])
    const git = /^git(?:\s+-C\s+("[^"]+"|'[^']+'|\S+))?\s+push\b(.*)$/.exec(s)
    if (git) return { dir: git[1] ? unquote(git[1]) : dir, args: git[2] ?? '' }
  }
  return null
}

export const register: Register = on => {
  let poll: Timer | undefined

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const push = findPush(e.command)
    if (!push) return next(e)

    const session = await $.session.cwd()
    const cwd = !push.dir ? session : push.dir.startsWith('/') ? push.dir : `${session}/${push.dir}`
    const remote = (await $.process.run(['git', '-C', cwd, 'remote', 'get-url', 'origin'])).stdout
    const branch = (await $.process.run(['git', '-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim()
    const site = SITES.find(s => remote.includes(s.repo))
    const isMain = /\bmain\b/.test(push.args) || branch === 'main'
    if (!site || !isMain) return next(e)

    const before = await liveBuild($, site.url)
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError === true || before === null) return ran

    poll?.cancel()
    const startedAt = await $.clock.now()
    $.ui.status(`deploy-watch: waiting for ${site.name} build`)
    poll = $.clock.every(POLL_MS, () => {
      void (async () => {
        const now = await $.clock.now()
        const build = await liveBuild($, site.url)
        if (build !== null && build !== before) {
          poll?.cancel()
          $.ui.status(undefined)
          const mins = Math.round((now - startedAt) / 60_000)
          $.ui.toast(`${site.name}: new build ${build} is live (${mins}m after push).`, { timeoutMs: 30_000 })
        } else if (now - startedAt > GIVE_UP_MS) {
          poll?.cancel()
          $.ui.status(undefined)
          $.ui.toast(`${site.name}: no new build after 25m. Check the Cloudflare dashboard.`, { timeoutMs: 30_000 })
        }
      })()
    })
    return ran
  })
}
