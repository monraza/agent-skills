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

test('a typed /spec makes Define active, shows one activity row, and its age moves on', async ($, on) => {
  const clock = mock.clock(on, { now: 10 * MINUTE })
  engine(on)
  await $.session.start(sessionStart)

  // The order the live recording showed: command, its own skill, its turn.
  await $.command.run(typedCommand.commandRun)
  await $.skill.prompt(typedCommand.skillPrompt)
  await $.turn.start(typedCommand.turnStart)

  const ui = await $.ui.mount(PANE)
  expect(await texts(ui)).toContain('◉ Define')
  expect(await texts(ui)).toContain('Define · since /spec, just now')
  expect((await texts(ui)).filter(text => text?.includes('/spec ·'))).toEqual(['/spec · Define · just now'])

  await clock.advance(4 * MINUTE)
  expect(await texts(ui)).toContain('Define · since /spec, 4 min ago')
  await ui.unmount()
})

test('/plan after /spec makes Plan active and marks Define visited', async ($, on) => {
  mock.clock(on)
  engine(on)
  await $.session.start(sessionStart)
  await $.command.run(typedCommand.commandRun)
  await $.turn.start(typedCommand.turnStart)
  await $.command.run({ ...typedCommand.commandRun, command: 'plan', args: '' })
  await $.turn.start({ ...typedCommand.turnStart, turnId: 'turn-plan' })

  const ui = await $.ui.mount(PANE)
  const shown = await texts(ui)
  expect(shown).toContain('· Define')
  expect(shown).toContain('◉ Plan')
  expect(shown).toContain('Plan · since /plan, just now')
  expect(shown.indexOf('/plan · Plan · just now')).toBeLessThan(shown.indexOf('/spec · Define · just now'))
  await ui.unmount()
})

test('a skill fired through the Skill tool, with no command, makes Build active', async ($, on) => {
  mock.clock(on)
  engine(on)
  await $.session.start(sessionStart)
  await $.turn.start(turnStart)
  await $.skill.prompt({ ...skillPrompt, skill: 'agent-skills:test-driven-development' })

  const ui = await $.ui.mount(PANE)
  expect(await texts(ui)).toContain('Build · since skill test-driven-development, just now')
  await ui.unmount()
})

test('/test then test-driven-development in the same turn leaves Verify active', async ($, on) => {
  mock.clock(on)
  engine(on)
  await $.session.start(sessionStart)
  await $.command.run({ ...typedCommand.commandRun, command: 'test', args: '' })
  await $.turn.start({ ...typedCommand.turnStart, turnId: 'turn-test' })
  await $.skill.prompt({ ...skillPrompt, skill: 'agent-skills:test-driven-development' })

  const ui = await $.ui.mount(PANE)
  const shown = await texts(ui)
  expect(shown).toContain('Verify · since /test, just now')
  expect(shown).toContain('skill test-driven-development · Build · just now')
  await ui.unmount()
})

test('an unmapped skill is listed without a phase and changes nothing', async ($, on) => {
  mock.clock(on)
  engine(on)
  await $.session.start(sessionStart)
  await $.turn.start(turnStart)
  await $.skill.prompt(skillPrompt)

  const ui = await $.ui.mount(PANE)
  const shown = await texts(ui)
  expect(shown).toContain('skill anthropic-skills:brand-guidelines · just now')
  expect(shown).toContain('No phase yet')
  await ui.unmount()
})

test("/monitor's text summary shows the same phase and activity", async ($, on) => {
  mock.clock(on)
  engine(on)
  await $.session.start(sessionStart)
  await $.command.run(typedCommand.commandRun)
  await $.skill.prompt(typedCommand.skillPrompt)
  await $.turn.start(typedCommand.turnStart)

  const out = await $.command.run({ ...typedCommand.commandRun, command: 'monitor', args: '' })
  expect(out.text).toContain('◉ Define\n')
  expect(out.text).toContain('Define · since /spec, just now')
  expect(out.text).toContain('Activity: ')
  expect(out.text).toContain('/spec · Define · just now')
})

test('command.run, skill.prompt and turn.start pass through unchanged', async ($, on) => {
  mock.clock(on)
  engine(on)
  await $.session.start(sessionStart)

  expect(await $.command.run(typedCommand.commandRun)).toEqual(typedCommand.commandResult)
  expect(await $.skill.prompt(typedCommand.skillPrompt)).toEqual({ text: typedCommand.skillPrompt.text })
  expect(await $.turn.start(typedCommand.turnStart)).toEqual({ turnId: typedCommand.turnStart.turnId })
})
