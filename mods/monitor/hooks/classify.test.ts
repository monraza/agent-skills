import { describe, expect, test } from 'claude-code/testing'

import { addFile, commitOf } from './classify'
import { bashFail, bashPass, gitCommit } from './fixtures/live-events'

describe('commits', () => {
  test('a successful commit gives its short hash and subject', () => {
    expect(commitOf(gitCommit.result)).toEqual({ sha: '298bd7b', subject: 'probe: first commit' })
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

    expect(commitOf(result)).toEqual({ sha: 'a1b2c3d', subject: 'fix(api): handle empty pages' })
  })

  test('a commit whose output has no subject line keeps the hash', () => {
    const result = { ...gitCommit.result, result: { ...gitCommit.result.result, stdout: '' } }

    expect(commitOf(result)).toEqual({ sha: '298bd7b', subject: '' })
  })

  test('a failed command or one that made no commit gives nothing', () => {
    expect(commitOf(bashFail.result)).toBeNull()
    expect(commitOf(bashPass.result)).toBeNull()
    expect(commitOf({ deny: 'refused' })).toBeNull()
  })
})

describe('changed files', () => {
  test('each file is listed once, the most recently changed last', () => {
    expect(addFile(['a.ts', 'b.ts'], 'c.ts')).toEqual(['a.ts', 'b.ts', 'c.ts'])
    expect(addFile(['a.ts', 'b.ts'], 'a.ts')).toEqual(['b.ts', 'a.ts'])
  })
})
