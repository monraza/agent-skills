import { describe, expect, test } from 'claude-code/testing'

import type { OpenGroups, PhaseId } from '../types'

import { NO_ARTIFACTS } from './artifacts'
import { NEW_TURN, afterCommand, afterTurnStart, commandEntry, skillEntry } from './phases'
import { GROUPS_AT_START, ago, sectionsOf } from './sections'
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

const block = (data: SessionData, key: string, viewing: PhaseId | null = null) =>
  sectionsOf(data, viewing).find(section => section.key === key)

const texts = (data: SessionData, viewing: PhaseId | null = null) =>
  sectionsOf(data, viewing).flatMap(section => [section.title, ...section.lines.map(line => line.text)])

describe('the blocks', () => {
  test('an empty session: the stepper and No step yet, nothing else', () => {
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
        key: 'header',
        title: null,
        lines: [
          { text: 'No step yet', tone: 'current' },
          { text: 'waiting for an agent-skills command or skill', tone: 'muted' },
        ],
      },
    ])
  })

  test('the current step: its name and what started it, with no step number', () => {
    const data = { ...EMPTY, activity: [commandEntry('spec', 0)], now: 4 * MINUTE }

    expect(block(data, 'header')?.lines).toEqual([
      { text: 'DEFINE', tone: 'current' },
      { text: 'started by /spec · 4 min ago', tone: 'muted' },
    ])
  })

  test("while Build is current, the todo's tasks in three groups: completed, in progress, to do", () => {
    const data = {
      ...EMPTY,
      activity: [commandEntry('spec', 0), commandEntry('build', MINUTE)],
      artifacts: {
        ...NO_ARTIFACTS,
        hasSpec: true,
        todo: { done: 1, total: 4 },
        todoTasks: [
          { number: '1', title: 'Parser', done: true, started: true },
          { number: '2', title: 'Wiring', done: false, started: false },
          { number: '3', title: 'Docs', done: false, started: true },
          { number: '4', title: 'Release', done: false, started: false },
        ],
      },
      now: 5 * MINUTE,
    }

    expect(block(data, 'stepper')?.lines.map(line => line.text)).toEqual([
      '✓ Define',
      '○ Plan',
      '● Build 1/4',
      '○ Verify',
      '○ Review',
      '○ Ship',
    ])
    // A task with some boxes checked is in progress, wherever it is.
    expect(block(data, 'tasks')).toEqual({
      key: 'tasks',
      title: 'Tasks · 1 of 4 done',
      lines: [
        { text: 'Completed · 1', tone: 'normal', group: 'completed', open: true },
        { text: '✓ 1. Parser', tone: 'done', indent: true },
        { text: 'In progress · 1', tone: 'normal', group: 'working', open: true },
        { text: '● 3. Docs', tone: 'current', indent: true },
        { text: 'To do · 2', tone: 'normal', group: 'todo', open: true },
        { text: '○ 2. Wiring', tone: 'muted', indent: true },
        { text: '○ 4. Release', tone: 'muted', indent: true },
      ],
    })
  })

  test("a folded group shows its name and count, not its tasks; Completed starts folded", () => {
    const data = {
      ...EMPTY,
      activity: [commandEntry('build', 0)],
      artifacts: {
        ...NO_ARTIFACTS,
        todo: { done: 1, total: 2 },
        todoTasks: [
          { number: '1', title: 'Parser', done: true, started: false },
          { number: '2', title: 'Wiring', done: false, started: false },
        ],
      },
    }
    const lines = (open: OpenGroups) => sectionsOf(data, null, open).find(section => section.key === 'tasks')?.lines

    expect(lines(GROUPS_AT_START)).toEqual([
      { text: 'Completed · 1', tone: 'normal', group: 'completed', open: false },
      { text: 'In progress · 1', tone: 'normal', group: 'working', open: true },
      { text: '● 2. Wiring', tone: 'current', indent: true },
    ])
    expect(lines({ completed: true, working: false, todo: true })?.map(line => line.text)).toEqual([
      'Completed · 1',
      '✓ 1. Parser',
      'In progress · 1',
    ])
  })

  test("with nothing started, the first open task is in progress; a group with no tasks isn't shown", () => {
    const data = {
      ...EMPTY,
      activity: [commandEntry('build', 0)],
      artifacts: {
        ...NO_ARTIFACTS,
        todo: { done: 0, total: 2 },
        todoTasks: [
          { number: '1', title: 'Parser', done: false, started: false },
          { number: '2', title: 'Wiring', done: false, started: false },
        ],
      },
    }

    expect(block(data, 'tasks')?.lines.map(line => line.text)).toEqual(['In progress · 1', '● 1. Parser', 'To do · 1', '○ 2. Wiring'])
  })

  test("without a todo, Build lists the session's own tasks by their status", () => {
    const data: SessionData = {
      ...EMPTY,
      activity: [commandEntry('build', 0)],
      tasks: [
        { id: '1', subject: 'Write the test', status: 'completed' },
        { id: '2', subject: 'Make it pass', status: 'pending' },
        { id: '3', subject: 'Refactor', status: 'in_progress' },
      ],
    }

    expect(block(data, 'tasks')?.lines.map(line => line.text)).toEqual([
      'Completed · 1',
      '✓ 1. Write the test',
      'In progress · 1',
      '● 3. Refactor',
      'To do · 1',
      '○ 2. Make it pass',
    ])
  })

  test('the task list shows whenever Build is the step on show', () => {
    const artifacts = { ...NO_ARTIFACTS, todo: { done: 0, total: 1 }, todoTasks: [{ number: '1', title: 'Parser', done: false, started: false }] }
    const later = { ...EMPTY, artifacts, activity: [commandEntry('build', 0), commandEntry('test', 1)] }

    expect(block({ ...EMPTY, artifacts, activity: [commandEntry('plan', 0)] }, 'tasks')).toBeUndefined()
    expect(block({ ...EMPTY, artifacts }, 'tasks')).toBeUndefined()
    expect(block(later, 'tasks')).toBeUndefined()
    expect(block(later, 'tasks', 'build')?.title).toBe('Tasks · 0 of 1 done')
  })

  test('a step the session has been through shows ✓', () => {
    const data = { ...EMPTY, activity: [commandEntry('test', 0), commandEntry('review', 1)] }

    expect(block(data, 'stepper')?.lines.map(line => line.text)).toContain('✓ Verify')
  })

  test("a started or done step is a button; a step not reached isn't", () => {
    const data = { ...EMPTY, activity: [commandEntry('spec', 0), commandEntry('build', 1)], artifacts: { ...NO_ARTIFACTS, hasPlan: true } }

    expect(block(data, 'stepper')?.lines).toEqual([
      { text: '✓ Define', tone: 'done', phase: 'define' },
      { text: '✓ Plan', tone: 'done', phase: 'plan' },
      { text: '● Build', tone: 'current', phase: 'build' },
      { text: '○ Verify', tone: 'muted' },
      { text: '○ Review', tone: 'muted' },
      { text: '○ Ship', tone: 'muted' },
    ])
  })
})

describe("a step's view", () => {
  // Define from 0, Build from 10 min; now 20 min.
  const session: SessionData = {
    ...EMPTY,
    activity: [
      commandEntry('spec', 0),
      skillEntry('agent-skills:spec-driven-development', 0, afterTurnStart(afterCommand(NEW_TURN, 'spec'))),
      commandEntry('build', 10 * MINUTE),
      commandEntry('model', 11 * MINUTE),
    ],
    files: [
      { path: 'SPEC.md', at: 1 * MINUTE, created: true },
      { path: 'a.ts', at: 11 * MINUTE, created: true },
      { path: 'b.ts', at: 12 * MINUTE, created: false },
      { path: 'a.ts', at: 13 * MINUTE, created: false },
    ],
    commits: [{ sha: 'c0ffee1', subject: 'feat: a', at: 14 * MINUTE }],
    checks: [
      { label: 'tsc', ok: false, at: 15 * MINUTE },
      { label: 'npm test', ok: true, at: 16 * MINUTE },
      { label: 'tsc', ok: true, at: 17 * MINUTE },
    ],
    now: 20 * MINUTE,
  }

  test('lists the files changed, commits and checks from while it was current: each file and check once, newest first', () => {
    expect(sectionsOf(session).slice(2)).toEqual([
      {
        key: 'files',
        title: 'Files changed · 2',
        lines: [
          { text: 'created a.ts', tone: 'normal', time: '7 min ago' },
          { text: 'edited b.ts', tone: 'normal', time: '8 min ago' },
        ],
      },
      { key: 'commits', title: 'Commits · 1', lines: [{ text: 'c0ffee1 feat: a', tone: 'normal', time: '6 min ago' }] },
      {
        key: 'checks',
        title: 'Checks · 2',
        lines: [
          { text: '✓ tsc', tone: 'done', time: '3 min ago' },
          { text: '✓ npm test', tone: 'done', time: '4 min ago' },
        ],
      },
    ])
  })

  test("an earlier step shows only its own events, and leaves out empty lists", () => {
    expect(sectionsOf(session, 'define').slice(2)).toEqual([
      { key: 'files', title: 'Files changed · 1', lines: [{ text: 'created SPEC.md', tone: 'normal', time: '19 min ago' }] },
    ])
  })

  test('commands and skills are not listed: the header names the one that started the step', () => {
    for (const step of [null, 'define'] as const) {
      const shown = texts(session, step)
      expect(shown.filter(text => text?.includes('/') || text?.includes('skill'))).toEqual(
        step === null ? ['started by /build · 10 min ago'] : ['started by /spec · 20 min ago'],
      )
    }
  })

  test("the checks' title counts those whose latest result failed", () => {
    const data: SessionData = {
      ...EMPTY,
      checks: [
        { label: 'tsc', ok: true, at: 0 },
        { label: 'tsc', ok: false, at: 1 },
        { label: 'jest', ok: false, at: 2 },
        { label: 'lint', ok: false, at: 3 },
        { label: 'lint', ok: true, at: 4 },
      ],
    }

    expect(block(data, 'checks')?.title).toBe('Checks · 3, 2 failing')
  })

  test('an earlier step: its name in the done colour, what started it, and a button back to the current step', () => {
    const data = { ...EMPTY, activity: [commandEntry('spec', 0), commandEntry('plan', 60 * MINUTE), commandEntry('build', 120 * MINUTE)], now: 120 * MINUTE }

    expect(block(data, 'header', 'plan')?.lines).toEqual([
      { text: 'PLAN', tone: 'done', back: 'Back to Build' },
      { text: 'started by /plan · 1 h ago', tone: 'muted' },
    ])
    expect(block(data, 'stepper', 'plan')?.lines[1]).toEqual({ text: '✓ Plan', tone: 'done', phase: 'plan', selected: true })
    // The current step on show is the normal view: no button back, nothing underlined.
    expect(block(data, 'header', 'build')?.lines[0]).toEqual({ text: 'BUILD', tone: 'current' })
    expect(block(data, 'stepper', 'build')?.lines.some(line => line.selected === true)).toBe(false)
  })

  test("a step done before this session, and one not started, say so", () => {
    const data = { ...EMPTY, activity: [commandEntry('build', 0)], artifacts: { ...NO_ARTIFACTS, hasSpec: true } }

    expect(block(data, 'header', 'define')?.lines[1]).toEqual({ text: 'done before this session', tone: 'muted' })
    expect(block(data, 'header', 'ship')?.lines[1]).toEqual({ text: 'not started in this session', tone: 'muted' })
  })

  test('a step with no files, commits or checks says so; the No step yet view does not', () => {
    const data = { ...EMPTY, activity: [commandEntry('build', 0)] }

    expect(block(data, 'nothing')).toEqual({ key: 'nothing', title: null, lines: [{ text: 'Nothing changed in this step yet.', tone: 'muted' }] })
    expect(block(EMPTY, 'nothing')).toBeUndefined()
  })

  test('before any step, the No step yet view lists what happened so far', () => {
    const data: SessionData = { ...EMPTY, files: [{ path: 'notes.md', at: 0, created: false }], now: MINUTE }

    expect(block(data, 'files')?.lines).toEqual([{ text: 'edited notes.md', tone: 'normal', time: '1 min ago' }])
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
  test('task groups are unfolded, their tasks indented under them', () => {
    const data: SessionData = {
      ...EMPTY,
      activity: [commandEntry('build', 0)],
      tasks: [
        { id: '1', subject: 'Write the test', status: 'completed' },
        { id: '2', subject: 'Make it pass', status: 'in_progress' },
      ],
    }

    expect(summaryOf(sectionsOf(data))).toContain(
      ['Tasks · 1 of 2 done', '  Completed · 1', '    ✓ 1. Write the test', '  In progress · 1', '    ● 2. Make it pass'].join('\n'),
    )
  })

  test('the same blocks, separated by blank lines, the stepper on one line', () => {
    const data: SessionData = {
      ...EMPTY,
      activity: [commandEntry('build', 0)],
      files: [{ path: 'src/a.ts', at: 2 * MINUTE, created: false }],
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
        'Files changed · 1',
        '  edited src/a.ts · 2 min ago',
      ].join('\n'),
    )
  })
})
