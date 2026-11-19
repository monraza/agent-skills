import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { sessionStart, skillPrompt, turnStart, typedCommand } from './fixtures/live-events'

const PANE = {
  plugin: 'monitor',
  component: 'Pane',
  requestId: 'monitor',
  surface: 'desktop',
  props: {
    title: 'Workflow',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const MINUTE = 60_000

// The engine beneath the plugin, answering as the live recording did.
const engine = (on: On) => {
  on('command.register', () => ({ value: { command: 'monitor' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.run', () => typedCommand.commandResult)
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'no-surface: no surface is attached' } }))
}

const texts = async (ui: { findAll: (q: { type: string }) => Promise<readonly { text?: string }[]> }) =>
  (await ui.findAll({ type: 'Text' })).map(one => one.text)

test('a typed /spec makes Define the current step, and its age moves on', async ($, on) => {
  const clock = mock.clock(on, { now: 10 * MINUTE })
  engine(on)
  await $.session.start(sessionStart)

  // The order the live recording showed: command, its own skill, its turn.
  await $.command.run(typedCommand.commandRun)
  await $.skill.prompt(typedCommand.skillPrompt)
  await $.turn.start(typedCommand.turnStart)

  const ui = await $.ui.mount(PANE)
  expect(await texts(ui)).toContain('● Define')
  expect(await texts(ui)).toContain('DEFINE')
  expect(await texts(ui)).toContain('started by /spec · just now')
  // Commands and skills are not listed: the header names the one that started the step.
  expect((await texts(ui)).filter(text => text?.includes('spec'))).toEqual(['started by /spec · just now'])

  await clock.advance(4 * MINUTE)
  expect(await texts(ui)).toContain('started by /spec · 4 min ago')
  await ui.unmount()
})

test('/plan after /spec makes Plan current and marks Define ✓', async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  await $.session.start(sessionStart)
  await $.command.run(typedCommand.commandRun)
  await $.turn.start(typedCommand.turnStart)
  await clock.advance(60_000)
  await $.command.run({ ...typedCommand.commandRun, command: 'plan', args: '' })
  await $.turn.start({ ...typedCommand.turnStart, turnId: 'turn-plan' })

  const ui = await $.ui.mount(PANE)
  const shown = await texts(ui)
  expect(shown).toContain('✓ Define')
  expect(shown).toContain('● Plan')
  expect(shown).toContain('started by /plan · just now')
  await ui.unmount()
})

test('a skill fired through the Skill tool, with no command, makes Build the current step', async ($, on) => {
  mock.clock(on)
  engine(on)
  await $.session.start(sessionStart)
  await $.turn.start(turnStart)
  await $.skill.prompt({ ...skillPrompt, skill: 'agent-skills:test-driven-development' })

  const ui = await $.ui.mount(PANE)
  expect(await texts(ui)).toContain('started by skill test-driven-development · just now')
  await ui.unmount()
})

test('/test then test-driven-development in the same turn leaves Verify current', async ($, on) => {
  mock.clock(on)
  engine(on)
  await $.session.start(sessionStart)
  await $.command.run({ ...typedCommand.commandRun, command: 'test', args: '' })
  await $.turn.start({ ...typedCommand.turnStart, turnId: 'turn-test' })
  await $.skill.prompt({ ...skillPrompt, skill: 'agent-skills:test-driven-development' })

  const ui = await $.ui.mount(PANE)
  const shown = await texts(ui)
  expect(shown).toContain('VERIFY')
  expect(shown).toContain('started by /test · just now')
  expect(shown).not.toContain('skill test-driven-development')
  await ui.unmount()
})

test('a skill outside the workflow is not shown and changes nothing', async ($, on) => {
  mock.clock(on)
  engine(on)
  await $.session.start(sessionStart)
  await $.turn.start(turnStart)
  await $.skill.prompt(skillPrompt)

  const ui = await $.ui.mount(PANE)
  const shown = await texts(ui)
  expect(shown).not.toContain('skill anthropic-skills:brand-guidelines')
  expect(shown).toContain('No step yet')
  await ui.unmount()
})

test("/monitor's text summary shows the same step", async ($, on) => {
  mock.clock(on)
  engine(on)
  await $.session.start(sessionStart)
  await $.command.run(typedCommand.commandRun)
  await $.skill.prompt(typedCommand.skillPrompt)
  await $.turn.start(typedCommand.turnStart)

  const out = await $.command.run({ ...typedCommand.commandRun, command: 'monitor', args: '' })
  expect(out.text).toContain('● Define ─ ○ Plan')
  expect(out.text).toContain('\nDEFINE\nstarted by /spec · just now\n')
  expect(out.text).toContain('\nNothing changed in this step yet.')
})

test('command.run, skill.prompt and turn.start pass through unchanged', async ($, on) => {
  mock.clock(on)
  engine(on)
  await $.session.start(sessionStart)

  expect(await $.command.run(typedCommand.commandRun)).toEqual(typedCommand.commandResult)
  expect(await $.skill.prompt(typedCommand.skillPrompt)).toEqual({ text: typedCommand.skillPrompt.text })
  expect(await $.turn.start(typedCommand.turnStart)).toEqual({ turnId: typedCommand.turnStart.turnId })
})
