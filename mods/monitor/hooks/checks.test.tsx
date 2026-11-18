import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { bashFail, bashPass, sessionStart, typedCommand } from './fixtures/live-events'

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
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const MINUTE = 60_000

// The recorded passing and failing Bash calls, running check commands.
const evalsPass = { ...bashPass.input, tool_use_id: 'toolu_evals', command: 'node scripts/run-evals.js' }
const testsFail = { ...bashFail.input, tool_use_id: 'toolu_tests', command: 'npm test' }

const engine = (on: On) => {
  on('command.register', () => ({ value: { command: 'monitor' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.run', () => typedCommand.commandResult)
  on('tool.call', (_, e) =>
    (e.tool_use_id === testsFail.tool_use_id ? bashFail.result : bashPass.result) as typeof bashPass.result,
  )
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'no-surface: no surface is attached' } }))
}

const texts = async (ui: { findAll: (q: { type: string }) => Promise<readonly { text?: string }[]> }) =>
  (await ui.findAll({ type: 'Text' })).map(one => one.text)

test('a passing and a failing check show ✓ and ✗, newest first', async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  await $.session.start(sessionStart)
  await $.tool.call(evalsPass)
  await clock.advance(3 * MINUTE)
  await $.tool.call(testsFail)

  const ui = await $.ui.mount(PANE)
  const shown = await texts(ui)
  expect(shown).toContain('Checks')
  expect(shown.indexOf('✗ npm test · just now')).toBeLessThan(shown.indexOf('✓ run-evals · 3 min ago'))
  expect(shown.indexOf('✗ npm test · just now')).toBeGreaterThan(-1)
  await ui.unmount()
})

test('a Bash command that is not a check is not listed', async ($, on) => {
  mock.clock(on)
  engine(on)
  await $.session.start(sessionStart)
  await $.tool.call(bashPass.input)

  const ui = await $.ui.mount(PANE)
  expect(await texts(ui)).toContain('No checks run yet.')
  await ui.unmount()
})

test("/monitor's text summary lists the same checks", async ($, on) => {
  mock.clock(on)
  engine(on)
  await $.session.start(sessionStart)
  await $.tool.call(evalsPass)
  await $.tool.call(testsFail)

  const out = await $.command.run({ ...typedCommand.commandRun, command: 'monitor', args: '' })
  expect(out.text).toContain('\nChecks: ✗ npm test · just now; ✓ run-evals · just now')
})

test('a check command passes through unchanged', async ($, on) => {
  mock.clock(on)
  engine(on)
  await $.session.start(sessionStart)

  expect(await $.tool.call(testsFail)).toEqual(bashFail.result)
  expect(await $.tool.call(evalsPass)).toEqual(bashPass.result)
})
