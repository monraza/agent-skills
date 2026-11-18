import { describe, expect, test } from 'claude-code/testing'

import { NO_ARTIFACTS } from './artifacts'
import { commandEntry, skillEntry, NEW_TURN } from './phases'
import { ago, sectionsOf } from './sections'
import type { SessionData } from './sections'
import { summaryOf } from './summary'

const MINUTE = 60_000

const EMPTY: SessionData = {
  activity: [],
  artifacts: NO_ARTIFACTS,
  files: [],
  commits: [],
  checks: [],
  tasks: [],
  now: 0,
}

const block = (data: SessionData, key: string) => sectionsOf(data).find(section => section.key === key)

describe('the blocks', () => {
  test('an empty session: the stepper, No step yet, and the totals; no Recent block', () => {
    expect(sectionsOf(EMPTY)).toEqual([
      {
        key: 'stepper',
        title: null,
        lines: [
          { text: '○ Define', tone: 'muted' },
          { text: '○ Plan', tone: 'muted' },
          { text: '○ Build', tone: 'muted' },
          { text: '○ Verify', tone: 'muted' },
          { text: '○ Review', tone: 'muted' },
          { text: '○ Ship', tone: 'muted' },
        ],
      },
      {
        key: 'current',
        title: null,
        lines: [
          { text: 'No step yet', tone: 'current' },
          { text: 'waiting for an agent-skills command or skill', tone: 'muted' },
        ],
      },
      { key: 'totals', title: null, lines: [{ text: 'no files changed · no commits · no checks', tone: 'muted' }] },
    ])
  })

  test('the current step: its name and what started it, with no step number', () => {
    const data = { ...EMPTY, activity: [commandEntry('spec', 0)], now: 4 * MINUTE }

    expect(block(data, 'current')?.lines).toEqual([
      { text: 'DEFINE', tone: 'current' },
      { text: 'started by /spec · 4 min ago', tone: 'muted' },
    ])
  })

  test("while Build is current, the todo's tasks: ✓ done, ▸ the first open one, ○ the rest", () => {
    const data = {
      ...EMPTY,
      activity: [commandEntry('spec', 0), commandEntry('build', MINUTE)],
      artifacts: {
        ...NO_ARTIFACTS,
        hasSpec: true,
        todo: { done: 1, total: 3 },
        todoTasks: [
          { title: 'Task 1: Parser', done: true },
          { title: 'Task 2: Wiring', done: false },
          { title: 'Task 3: Docs', done: false },
        ],
      },
      now: 5 * MINUTE,
    }

    expect(block(data, 'stepper')?.lines.map(line => line.text)).toEqual([
      '✓ Define',
      '○ Plan',
      '● Build 1/3',
      '○ Verify',
      '○ Review',
      '○ Ship',
    ])
    expect(block(data, 'tasks')).toEqual({
      key: 'tasks',
      title: 'Tasks · 1 of 3 done',
      lines: [
        { text: '✓ Task 1: Parser', tone: 'done' },
        { text: '▸ Task 2: Wiring', tone: 'current' },
        { text: '○ Task 3: Docs', tone: 'muted' },
      ],
    })
  })

  test("without a todo, Build lists the session's own tasks", () => {
    const data: SessionData = {
      ...EMPTY,
      activity: [commandEntry('build', 0)],
      tasks: [
        { id: '1', subject: 'Write the test', status: 'completed' },
        { id: '2', subject: 'Make it pass', status: 'in_progress' },
      ],
    }

    expect(block(data, 'tasks')?.lines.map(line => line.text)).toEqual(['✓ Write the test', '▸ Make it pass'])
  })

  test('the task list is only shown while Build is current', () => {
    const artifacts = { ...NO_ARTIFACTS, todo: { done: 0, total: 1 }, todoTasks: [{ title: 'Task 1', done: false }] }

    expect(block({ ...EMPTY, artifacts, activity: [commandEntry('plan', 0)] }, 'tasks')).toBeUndefined()
    expect(block({ ...EMPTY, artifacts }, 'tasks')).toBeUndefined()
  })

  test('a step the session has been through shows ✓', () => {
    const data = { ...EMPTY, activity: [commandEntry('test', 0), commandEntry('review', 1)] }

    expect(block(data, 'stepper')?.lines.map(line => line.text)).toContain('✓ Verify')
  })

  test('Recent merges workflow events, newest first, at most 4, and leaves out the rest', () => {
    const data: SessionData = {
      ...EMPTY,
      activity: [
        commandEntry('spec', 0),
        commandEntry('model', 1 * MINUTE),
        skillEntry('anthropic-skills:brand-guidelines', 2 * MINUTE, NEW_TURN),
        commandEntry('monitor', 3 * MINUTE),
        skillEntry('agent-skills:spec-driven-development', 4 * MINUTE, NEW_TURN),
      ],
      files: [{ path: 'SPEC.md', at: 5 * MINUTE }],
      commits: [{ sha: 'a1b2c3d', subject: 'docs: add the spec', at: 6 * MINUTE }],
      checks: [
        { label: 'npm test', ok: false, at: 7 * MINUTE },
        { label: 'tsc', ok: true, at: 8 * MINUTE },
      ],
      now: 8 * MINUTE,
    }

    expect(block(data, 'recent')).toEqual({
      key: 'recent',
      title: 'Recent',
      lines: [
        { text: '✓ tsc', tone: 'done', time: 'just now' },
        { text: '✗ npm test', tone: 'failed', time: '1 min ago' },
        { text: 'committed a1b2c3d docs: add the spec', tone: 'normal', time: '2 min ago' },
        { text: 'edited SPEC.md', tone: 'normal', time: '3 min ago' },
      ],
    })
  })

  test('commands and skills outside the workflow never reach Recent', () => {
    const data = { ...EMPTY, activity: [commandEntry('model', 0), commandEntry('monitor', 1), commandEntry('compact', 2)] }

    expect(block(data, 'recent')).toBeUndefined()
  })

  test('the totals count everything, with failed checks and session tasks', () => {
    const data: SessionData = {
      ...EMPTY,
      files: [{ path: 'a.ts', at: 0 }, { path: 'b.ts', at: 1 }],
      commits: [{ sha: 'a1b2c3d', subject: 's', at: 2 }],
      checks: [{ label: 'tsc', ok: true, at: 3 }, { label: 'jest', ok: false, at: 4 }],
      tasks: [
        { id: '1', subject: 'one', status: 'completed' },
        { id: '2', subject: 'two', status: 'pending' },
      ],
    }

    expect(block(data, 'totals')?.lines[0]?.text).toBe('2 files changed · 1 commit · 2 checks, 1 failed · 1/2 tasks')
  })
})

describe('relative times', () => {
  test('just now, then minutes, then hours', () => {
    expect(ago(0, 59_999)).toBe('just now')
    expect(ago(0, MINUTE)).toBe('1 min ago')
    expect(ago(0, 59 * MINUTE)).toBe('59 min ago')
    expect(ago(0, 60 * MINUTE)).toBe('1 h ago')
    expect(ago(0, 150 * MINUTE)).toBe('2 h ago')
  })

  test('a time slightly ahead of now reads as just now', () => {
    expect(ago(1000, 0)).toBe('just now')
  })
})

describe('the text summary', () => {
  test('the same blocks, separated by blank lines, the stepper on one line', () => {
    const data: SessionData = {
      ...EMPTY,
      activity: [commandEntry('build', 0)],
      files: [{ path: 'src/a.ts', at: 2 * MINUTE }],
      now: 4 * MINUTE,
    }

    expect(summaryOf(sectionsOf(data))).toBe(
      [
        'Workflow',
        '○ Define ─ ○ Plan ─ ● Build ─ ○ Verify ─ ○ Review ─ ○ Ship',
        '',
        'BUILD',
        'started by /build · 4 min ago',
        '',
        'Recent',
        '  edited src/a.ts · 2 min ago',
        '  /build · 4 min ago',
        '',
        '1 file changed · no commits · no checks',
      ].join('\n'),
    )
  })
})
