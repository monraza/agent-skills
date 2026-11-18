import { expect, mock, test } from 'claude-code/testing'

import { sessionStart, typedCommand } from './fixtures/live-events'

const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const

const PANE = {
  plugin: 'monitor',
  component: 'Pane',
  requestId: 'monitor',
  props: {
    title: 'Workflow',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const EMPTY_SUMMARY = [
  'Workflow',
  '○ Define ─ ○ Plan ─ ○ Build ─ ○ Verify ─ ○ Review ─ ○ Ship',
  '',
  'No step yet',
  'waiting for an agent-skills command or skill',
  '',
  'no files changed · no commits · no checks',
].join('\n')

test('/monitor opens the Workflow pane', async ($, on) => {
  mock.clock(on)
  const opened: unknown[] = []
  on('command.register', () => ({ value: { command: 'monitor' } }))
  on('ui.open', (_, e) => {
    opened.push(e)

    return { value: { isPlaced: true } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start(sessionStart)
  await $.command.run({ ...typedCommand.commandRun, command: 'monitor', args: '' })

  expect(opened).toEqual([expect.objectContaining({ id: 'monitor', title: 'Workflow' })])
})

test('/monitor replies with the text summary when no surface shows the pane', async ($, on) => {
  mock.clock(on)
  on('command.register', () => ({ value: { command: 'monitor' } }))
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'no-surface: no surface is attached' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start(sessionStart)
  const out = await $.command.run({ ...typedCommand.commandRun, command: 'monitor', args: '' })

  // /monitor itself is outside the workflow, so it isn't shown.
  expect(out.text).toBe(EMPTY_SUMMARY)
})

test('/monitor still says the panel opened when a surface shows it', async ($, on) => {
  mock.clock(on)
  on('command.register', () => ({ value: { command: 'monitor' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start(sessionStart)
  const out = await $.command.run({ ...typedCommand.commandRun, command: 'monitor', args: '' })

  expect(out.text).toBe('Workflow panel opened.')
})

test('session.start and other commands pass through unchanged', async ($, on) => {
  mock.clock(on)
  on('command.register', () => ({ value: { command: 'monitor' } }))
  on('session.start', () => ({ cwd: '/from/the/engine' }))
  on('command.run', (_, e) => ({ text: `engine ran ${e.command}` }))

  expect(await $.session.start(sessionStart)).toEqual({ cwd: '/from/the/engine' })
  expect(await $.command.run(typedCommand.commandRun)).toEqual({ text: 'engine ran spec' })
})

test('an empty session shows no step yet and empty totals, on every surface', async ($, on) => {
  mock.clock(on)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })

    expect((await ui.find({ type: 'Text', text: 'No step yet' }))?.text).toBe('No step yet')
    expect((await ui.find({ type: 'Text', text: 'no files changed' }))?.text).toBe('no files changed · no commits · no checks')
    expect((await ui.find({ type: 'Text', text: '○ Define' }))?.text).toBe('○ Define')
    await ui.unmount()
  }
})
