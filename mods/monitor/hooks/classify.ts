import type { Check, Commit } from '../types'

// Pure: no `$`, no I/O. What a tool call's result means for the panel.

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

// A successful `git commit` result carries `result.gitOperation.commit.sha`
// (the live recording); the subject is on the `[branch sha] subject` line of
// its output. Only the hash and subject are kept.
export const commitOf = (ran: unknown): Commit | null => {
  if (!isRecord(ran) || ran.isError === true || !isRecord(ran.result)) return null
  const { gitOperation, stdout } = ran.result
  if (!isRecord(gitOperation) || !isRecord(gitOperation.commit)) return null
  const { sha } = gitOperation.commit
  if (typeof sha !== 'string' || sha === '') return null
  const marker = ` ${sha}] `
  const line = typeof stdout === 'string' ? stdout.split('\n').find(one => one.startsWith('[') && one.includes(marker)) : undefined

  return { sha, subject: line === undefined ? '' : line.slice(line.indexOf(marker) + marker.length) }
}

// The built-in check list (SPEC.md, What's tracked), matched at the start of
// one step of a command, each giving the label the panel shows.
const CHECKS: readonly [RegExp, (match: RegExpMatchArray) => string][] = [
  [/^npm (?:run )?test\b/, () => 'npm test'],
  [/^npm run lint\b/, () => 'npm run lint'],
  [/^node scripts\/(run-evals|validate-[\w-]+)\.js\b/, match => match[1] ?? ''],
  [/^bash hooks\/([\w-]+-test)\.sh\b/, match => match[1] ?? ''],
  [/^claude plugin (validate|test)\b/, match => `claude plugin ${match[1] ?? ''}`],
  [/^(tsc|eslint|jest|vitest|pytest)\b/, match => match[1] ?? ''],
  [/^(go|cargo) test\b/, match => `${match[1] ?? ''} test`],
]

// What runs a command without being it: `timeout 180`, `npx`, `time`, `VAR=value`.
const WRAPPER = /^(?:timeout\s+\S+|npx|time|[A-Za-z_][A-Za-z0-9_]*=\S*)\s+/

const labelOfStep = (step: string): string | null => {
  let rest = step.trim().replace(/^\(+\s*/, '')
  while (WRAPPER.test(rest)) rest = rest.replace(WRAPPER, '')
  for (const [pattern, label] of CHECKS) {
    const match = rest.match(pattern)
    if (match !== null) return label(match)
  }

  return null
}

// One label for the whole Bash call: each check it runs, in order.
export const checkLabelOf = (command: string): string | null => {
  const labels = command.split(/&&|\|\||;|\||\n/).flatMap(step => labelOfStep(step) ?? [])

  return labels.length === 0 ? null : [...new Set(labels)].join(', ')
}

// A check passed when its Bash call had no error and wasn't interrupted. One
// still running in the background has no result yet, so it isn't recorded.
export const checkOf = (command: string, ran: unknown, at: number): Check | null => {
  const label = checkLabelOf(command)
  if (label === null || !isRecord(ran)) return null
  const result = isRecord(ran.result) ? ran.result : {}
  if (typeof result.backgroundTaskId === 'string') return null

  return { at, label, ok: ran.isError !== true && result.interrupted !== true }
}

// Each file once, the most recently changed last.
export const addFile = (files: readonly string[], path: string): string[] => [
  ...files.filter(file => file !== path),
  path,
]
