import { expect, test } from 'claude-code/testing'

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

test('/monitor opens the Workflow pane', async ($, on) => {
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

test('session.start and other commands pass through unchanged', async ($, on) => {
  on('command.register', () => ({ value: { command: 'monitor' } }))
  on('session.start', () => ({ cwd: '/from/the/engine' }))
  on('command.run', (_, e) => ({ text: `engine ran ${e.command}` }))

  expect(await $.session.start(sessionStart)).toEqual({ cwd: '/from/the/engine' })
  expect(await $.command.run(typedCommand.commandRun)).toEqual({ text: 'engine ran spec' })
})

test('an empty session shows no phase and no activity, on every surface', async $ => {
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })

    expect((await ui.find({ type: 'Text', text: 'No phase yet' }))?.text).toBe('No phase yet')
    expect((await ui.find({ type: 'Text', text: 'No activity yet.' }))?.text).toBe('No activity yet.')
    await ui.unmount()
  }
})
