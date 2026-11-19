import { describe, expect, test } from 'claude-code/testing'

import {
  NEW_TURN,
  afterCommand,
  afterTurnStart,
  commandEntry,
  isOwnExpansion,
  phaseAt,
  phaseOfCommand,
  phaseOfSkill,
  phaseViewOf,
  skillEntry,
} from './phases'

const COMMANDS = [
  ['spec', 'define'],
  ['plan', 'plan'],
  ['build', 'build'],
  ['test', 'verify'],
  ['review', 'review'],
  ['code-simplify', 'review'],
  ['webperf', 'review'],
  ['ship', 'ship'],
  ['constraints', null],
] as const

const SKILLS = [
  ['interview-me', 'define'],
  ['idea-refine', 'define'],
  ['spec-driven-development', 'define'],
  ['planning-and-task-breakdown', 'plan'],
  ['incremental-implementation', 'build'],
  ['test-driven-development', 'build'],
  ['context-engineering', 'build'],
  ['source-driven-development', 'build'],
  ['doubt-driven-development', 'build'],
  ['frontend-ui-engineering', 'build'],
  ['api-and-interface-design', 'build'],
  ['browser-testing-with-devtools', 'verify'],
  ['debugging-and-error-recovery', 'verify'],
  ['code-review-and-quality', 'review'],
  ['code-simplification', 'review'],
  ['security-and-hardening', 'review'],
  ['performance-optimization', 'review'],
  ['git-workflow-and-versioning', 'ship'],
  ['ci-cd-and-automation', 'ship'],
  ['deprecation-and-migration', 'ship'],
  ['documentation-and-adrs', 'ship'],
  ['observability-and-instrumentation', 'ship'],
  ['shipping-and-launch', 'ship'],
  ['constraint-driven-development', null],
  ['using-agent-skills', null],
] as const

describe('the phase table', () => {
  test('maps every command, with and without the agent-skills: prefix', () => {
    for (const [name, phase] of COMMANDS) {
      expect(phaseOfCommand(name)).toBe(phase)
      expect(phaseOfCommand(`agent-skills:${name}`)).toBe(phase)
    }
  })

  test('maps every skill, with and without the agent-skills: prefix', () => {
    for (const [name, phase] of SKILLS) {
      expect(phaseOfSkill(name)).toBe(phase)
      expect(phaseOfSkill(`agent-skills:${name}`)).toBe(phase)
    }
  })

  test('leaves names outside the table unmapped', () => {
    expect(phaseOfCommand('compact')).toBeUndefined()
    expect(phaseOfSkill('anthropic-skills:brand-guidelines')).toBeUndefined()
    expect(phaseOfSkill('other-plugin:spec-driven-development')).toBeUndefined()
  })
})

describe('the active phase', () => {
  test('follows the most recent mapped command, and marks earlier ones visited', () => {
    const view = phaseViewOf([commandEntry('spec', 1), commandEntry('plan', 2)])

    expect(view.active?.phase).toBe('plan')
    expect(view.states).toEqual({
      define: 'visited',
      plan: 'active',
      build: 'todo',
      verify: 'todo',
      review: 'todo',
      ship: 'todo',
    })
  })

  test('a phase-less or unknown command changes nothing', () => {
    const view = phaseViewOf([commandEntry('spec', 1), commandEntry('constraints', 2), commandEntry('compact', 3)])

    expect(view.active?.name).toBe('spec')
  })

  test('a skill in a turn that did not start with a command sets the phase', () => {
    const turn = afterTurnStart(NEW_TURN)
    const view = phaseViewOf([skillEntry('agent-skills:test-driven-development', 1, turn)])

    expect(view.active?.phase).toBe('build')
  })

  test('a skill in a turn that started with a mapped command does not', () => {
    const turn = afterTurnStart(afterCommand(NEW_TURN, 'test'))
    const view = phaseViewOf([commandEntry('test', 1), skillEntry('test-driven-development', 2, turn)])

    expect(view.active?.phase).toBe('verify')
  })

  test('a skill between a command and its turn start counts as that turn', () => {
    const turn = afterCommand(NEW_TURN, 'test')

    expect(skillEntry('test-driven-development', 2, turn).setsPhase).toBe(false)
  })

  test('a phase-less command does not stop a skill setting the phase', () => {
    const turn = afterTurnStart(afterCommand(NEW_TURN, 'constraints'))

    expect(skillEntry('test-driven-development', 2, turn).setsPhase).toBe(true)
  })

  test('no entry that sets a phase means no active phase', () => {
    expect(phaseViewOf([]).active).toBeNull()
    expect(phaseViewOf([commandEntry('compact', 1)]).active).toBeNull()
  })
})

describe('the step current at a moment', () => {
  test('is the latest phase-setting entry at or before it; none before any', () => {
    const activity = [commandEntry('spec', 10), commandEntry('compact', 20), commandEntry('plan', 30)]

    expect(phaseAt(activity, 5)).toBeNull()
    expect(phaseAt(activity, 10)).toBe('define')
    expect(phaseAt(activity, 25)).toBe('define')
    expect(phaseAt(activity, 30)).toBe('plan')
    expect(phaseAt(activity, 99)).toBe('plan')
  })
})

describe("a typed command's own skill event", () => {
  test('is recognised until its turn starts', () => {
    const turn = afterCommand(NEW_TURN, 'spec')

    expect(isOwnExpansion(turn, 'spec')).toBe(true)
    expect(isOwnExpansion(turn, 'agent-skills:spec')).toBe(true)
    expect(isOwnExpansion(turn, 'spec-driven-development')).toBe(false)
    expect(isOwnExpansion(afterTurnStart(turn), 'spec')).toBe(false)
  })
})
