import { describe, expect, test } from 'claude-code/testing'

import { addFile, checkLabelOf, checkOf, commitOf, keepNewest } from './classify'
import { bashFail, bashPass, gitCommit } from './fixtures/live-events'

describe('check commands', () => {
  test('match the built-in list, wrapped or chained', () => {
    const cases = [
      ['npm test', 'npm test'],
      ['npm run test -- --coverage', 'npm test'],
      ['npm run lint', 'npm run lint'],
      ['node scripts/run-evals.js', 'run-evals'],
      ['node scripts/validate-skills.js', 'validate-skills'],
      ['bash hooks/sdd-cache-test.sh', 'sdd-cache-test'],
      ['PATH="${BASH_PATH_PREFIX}$PATH" bash hooks/simplify-ignore-test.sh', 'simplify-ignore-test'],
      ['claude plugin validate mods/monitor', 'claude plugin validate'],
      ['timeout 180 claude plugin test mods/monitor 2>&1 | grep -E "pass"', 'claude plugin test'],
      ['cd mods/monitor && npx tsc -p .', 'tsc'],
      ['npx eslint .', 'eslint'],
      ['npx jest', 'jest'],
      ['vitest run', 'vitest'],
      ['(cd api && pytest -q)', 'pytest'],
      ['go test ./...', 'go test'],
      ['cargo test', 'cargo test'],
      ['node scripts/validate-skills.js && node scripts/run-evals.js', 'validate-skills, run-evals'],
    ] as const

    for (const [command, label] of cases) expect(checkLabelOf(command)).toBe(label)
  })

  test('near misses are not checks', () => {
    const misses = [
      'npm install',
      'npm run build',
      'cat package.json',
      'grep -n tsc README.md',
      'echo npm test',
      'git commit -m "run the tests"',
      'ls scripts/validate-skills.js',
      'node scripts/build.js',
    ]

    for (const command of misses) expect(checkLabelOf(command)).toBeNull()
  })

  test('pass and fail come from the Bash result', () => {
    expect(checkOf('npm test', bashPass.result, 5)).toEqual({ at: 5, label: 'npm test', ok: true })
    expect(checkOf('npm test', bashFail.result, 5)).toEqual({ at: 5, label: 'npm test', ok: false })
    const interrupted = { ...bashPass.result, result: { ...bashPass.result.result, interrupted: true } }
    expect(checkOf('npm test', interrupted, 5)?.ok).toBe(false)
  })

  test('a check still running in the background, or not a check, gives nothing', () => {
    const background = { ...bashPass.result, result: { ...bashPass.result.result, backgroundTaskId: 'b1' } }
    expect(checkOf('npm test', background, 5)).toBeNull()
    expect(checkOf('echo probe-pass', bashPass.result, 5)).toBeNull()
  })
})

describe('commits', () => {
  test('a successful commit gives its short hash and subject', () => {
    expect(commitOf(gitCommit.result, 7)).toEqual({ sha: '298bd7b', subject: 'probe: first commit', at: 7 })
  })

  test('a commit on a branch with history reads the same way', () => {
    const result = {
      ...gitCommit.result,
      result: {
        ...gitCommit.result.result,
        stdout: '[main a1b2c3d] fix(api): handle empty pages\n 2 files changed',
        gitOperation: { commit: { sha: 'a1b2c3d', kind: 'committed', branch: 'main' } },
      },
    }

    expect(commitOf(result, 7)).toEqual({ sha: 'a1b2c3d', subject: 'fix(api): handle empty pages', at: 7 })
  })

  test('a commit whose output has no subject line keeps the hash', () => {
    const result = { ...gitCommit.result, result: { ...gitCommit.result.result, stdout: '' } }

    expect(commitOf(result, 7)).toEqual({ sha: '298bd7b', subject: '', at: 7 })
  })

  test('a failed command or one that made no commit gives nothing', () => {
    expect(commitOf(bashFail.result, 7)).toBeNull()
    expect(commitOf(bashPass.result, 7)).toBeNull()
    expect(commitOf({ deny: 'refused' }, 7)).toBeNull()
  })
})

describe('changed files', () => {
  test('each file is listed once, with the time of its latest change, most recent last', () => {
    const files = [{ path: 'a.ts', at: 1 }, { path: 'b.ts', at: 2 }]

    expect(addFile(files, 'c.ts', 3)).toEqual([...files, { path: 'c.ts', at: 3 }])
    expect(addFile(files, 'a.ts', 3)).toEqual([{ path: 'b.ts', at: 2 }, { path: 'a.ts', at: 3 }])
  })
})

describe('list caps', () => {
  test('a list keeps its newest 200 entries', () => {
    const list = Array.from({ length: 250 }, (_, index) => index)

    expect(keepNewest(list)).toEqual(list.slice(50))
    expect(keepNewest([1, 2])).toEqual([1, 2])
  })
})
