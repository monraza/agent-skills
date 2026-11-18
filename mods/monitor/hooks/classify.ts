import type { Commit } from '../types'

// Pure: no `$`, no I/O. What a tool call's result means for the panel.

const isRecord = (value: unknown): value is Record<string, unknown> =>
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

// Each file once, the most recently changed last.
export const addFile = (files: readonly string[], path: string): string[] => [
  ...files.filter(file => file !== path),
  path,
]
