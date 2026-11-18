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
  'No screen here shows panes, so here is the Workflow panel as text.',
  '',
  'Workflow',
  '○ Define',
  '○ Plan',
  '○ Build',
  '○ Verify',
  '○ Review',
  '○ Ship',
  'No phase yet',
  '',
  'No tasks yet.',
  'No activity yet.',
  'No files changed yet.',
  'No commits yet.',
  'No checks run yet.',
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

  // /monitor itself is an unmapped command, so it is the one activity row.
  expect(out.text).toBe(EMPTY_SUMMARY.replace('No activity yet.', 'Activity: /monitor · just now'))
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

test('an empty session shows no phase and no activity, on every surface', async ($, on) => {
  mock.clock(on)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })

    expect((await ui.find({ type: 'Text', text: 'No phase yet' }))?.text).toBe('No phase yet')
    expect((await ui.find({ type: 'Text', text: 'No activity yet.' }))?.text).toBe('No activity yet.')
    expect((await ui.find({ type: 'Text', text: '○ Define' }))?.text).toBe('○ Define')
    await ui.unmount()
  }
})
