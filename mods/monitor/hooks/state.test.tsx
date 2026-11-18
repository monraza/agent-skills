import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { bashPass, gitCommit, sessionStart, typedCommand, write } from './fixtures/live-events'
import { commandEntry } from './phases'

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

const CWD = sessionStart.cwd

const engine = (on: On) => {
  on('command.register', () => ({ value: { command: 'monitor' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: CWD }))
  on('command.run', () => typedCommand.commandResult)
  on('tool.call', (_, e) =>
    (e.tool === 'Write'
      ? write.result
      : e.tool === 'Bash' && e.command === gitCommit.input.command
        ? gitCommit.result
        : bashPass.result) as typeof bashPass.result,
  )
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'no-surface: no surface is attached' } }))
}

// What the session's state holds for the activity list, as some version of
// the mod stored it.
const storedActivity = (on: On, value: unknown) =>
  on('state.get', { plugin: 'monitor', key: 'activity' }, () => ({ value: { value, version: 1 } }))

const texts = async (ui: { findAll: (q: { type: string }) => Promise<readonly { text?: string }[]> }) =>
  (await ui.findAll({ type: 'Text' })).map(one => one.text)

test('activity an older version stored under another shape is dropped without error', async ($, on) => {
  mock.clock(on)
  storedActivity(on, { shape: 'activity-0', value: [{ name: 'spec', when: 'yesterday' }] })

  const ui = await $.ui.mount(PANE)
  expect(await texts(ui)).toContain('No activity yet.')
  await ui.unmount()
})

test('activity stored before the mod used shapes is dropped without error', async ($, on) => {
  mock.clock(on)
  storedActivity(on, [{ tool: 'Bash' }])

  const ui = await $.ui.mount(PANE)
  expect(await texts(ui)).toContain('No activity yet.')
  await ui.unmount()
})

test('activity stored by this version is shown', async ($, on) => {
  mock.clock(on)
  storedActivity(on, { shape: 'activity-1', value: [commandEntry('spec', 0)] })

  const ui = await $.ui.mount(PANE)
  expect(await texts(ui)).toContain('/spec · Define · just now')
  await ui.unmount()
})

test('each list keeps its newest 200 entries', async ($, on) => {
  mock.clock(on)
  engine(on)
  await $.session.start(sessionStart)
  for (let index = 0; index < 250; index++) {
    await $.command.run({ ...typedCommand.commandRun, command: 'compact', args: '' })
    await $.tool.call({ ...write.input, file_path: `${CWD}/file-${index}.md` })
    await $.tool.call({ ...bashPass.input, command: 'npm test' })
    await $.tool.call(gitCommit.input)
  }

  // The /monitor row itself makes 251 activity rows: 200 kept, 5 shown.
  const out = await $.command.run({ ...typedCommand.commandRun, command: 'monitor', args: '' })
  expect(out.text).toMatch(/\nActivity: [^\n]*; \+195 more\n/)
  expect(out.text).toMatch(/\nFiles \(200\): file-249\.md; [^\n]*; \+195 more\n/)
  expect(out.text).toMatch(/\nCommits: [^\n]*; \+195 more\n/)
  expect(out.text).toMatch(/\nChecks: [^\n]*; \+195 more$/)
})
