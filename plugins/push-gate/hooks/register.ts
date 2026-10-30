import type { EngineInterface, Register } from 'claude-code'

const MAIN = /\b(main|master)\b/

type Check = { name: string; argv: string[] }
type Push = { dir: string | undefined; args: string }

const unquote = (s: string) => s.replace(/^["']|["']$/g, '')

// The `git push` the command runs, if any: a statement that starts with git
// (not text that merely mentions it), with the folder from a `cd` before it
// or its own `-C`.
const findPush = (command: string): Push | null => {
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

const resolveDir = async ($: EngineInterface, dir: string | undefined) => {
  const cwd = await $.session.cwd()
  if (!dir) return cwd
  return dir.startsWith('/') ? dir : `${cwd}/${dir}`
}

// A repo's own `.claude/pre-push.sh` wins; otherwise repos with the SST
// client-script scan get the three checks from their CLAUDE.md.
const checksFor = async ($: EngineInterface, root: string): Promise<Check[]> => {
  const has = async (path: string) =>
    (await $.process.run(['test', '-f', `${root}/${path}`])).exitCode === 0
  if (await has('.claude/pre-push.sh')) {
    return [{ name: 'pre-push.sh', argv: ['bash', '.claude/pre-push.sh'] }]
  }
  if (await has('scripts/check-client.sh')) {
    return [
      { name: 'tsc', argv: ['npx', 'tsc', '--noEmit'] },
      { name: 'vitest', argv: ['npx', 'vitest', 'run'] },
      { name: 'check-client', argv: ['bash', 'scripts/check-client.sh'] },
    ]
  }
  return []
}

const tail = (text: string, lines = 15) => text.trim().split('\n').slice(-lines).join('\n')

export const register: Register = on => {
  // HEAD commits that already passed, so a retried push doesn't re-run them.
  const passed = new Set<string>()

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const push = findPush(e.command)
    if (!push) return next(e)

    const cwd = await resolveDir($, push.dir)
    const git = (...args: string[]) => $.process.run(['git', '-C', cwd, ...args])
    const top = await git('rev-parse', '--show-toplevel')
    if (top.exitCode !== 0) return next(e)
    const root = top.stdout.trim()
    const branch = (await git('rev-parse', '--abbrev-ref', 'HEAD')).stdout.trim()
    if (!MAIN.test(push.args) && !MAIN.test(branch)) return next(e)

    const head = (await git('rev-parse', 'HEAD')).stdout.trim()
    if (passed.has(head)) return next(e)

    const checks = await checksFor($, root)
    if (checks.length === 0) return next(e)

    $.ui.status('push-gate: running pre-push checks')
    try {
      for (const check of checks) {
        const r = await $.process.run(check.argv, { cwd: root, timeoutMs: 600_000 })
        // check-client.sh signals a problem by printing anything at all.
        const isBad = r.exitCode !== 0 || (check.name === 'check-client' && r.stdout.trim() !== '')
        if (isBad) {
          return {
            deny: `push-gate: ${check.name} failed in ${root}, so the push to main was blocked. Fix it and push again.\n${tail(r.stdout + '\n' + r.stderr)}`,
          }
        }
      }
    } finally {
      $.ui.status(undefined)
    }
    passed.add(head)
    return next(e)
  })
}
