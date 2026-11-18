import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { bashPass, gitCommit, sessionStart, taskCreate, typedCommand, write } from './fixtures/live-events'

const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const
const WIDE = 80
const NARROW = 40

const paneAt = <S extends (typeof SURFACES)[number]>(surface: S, bodyColumns: number, bodyRows = 40) =>
  ({
    plugin: 'monitor',
    component: 'Pane',
    requestId: 'monitor',
    surface,
    props: {
      title: 'Workflow',
      isFocused: false,
      bodyColumns,
      placement: 'dock',
      scroll: { offset: 0, bodyRows },
      view: {},
    },
  }) as const

const engine = (on: On) => {
  const results: Record<string, unknown> = {
    [write.input.tool_use_id]: write.result,
    [gitCommit.input.tool_use_id]: gitCommit.result,
    [taskCreate.input.tool_use_id]: taskCreate.result,
  }
  on('command.register', () => ({ value: { command: 'monitor' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: sessionStart.cwd }))
  on('command.run', () => typedCommand.commandResult)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', (_, e) => (results[e.tool_use_id ?? ''] ?? bashPass.result) as typeof bashPass.result)
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'no-surface: no surface is attached' } }))
}

const run = (command: string) => ({ ...typedCommand.commandRun, command, args: '' })

const texts = async (ui: { findAll: (q: { type: string }) => Promise<readonly { text?: string }[]> }) =>
  (await ui.findAll({ type: 'Text' })).map(one => one.text)

test('the phases sit on one row when wide, and stack at 40 columns or narrower and on mobile', async ($, on) => {
  mock.clock(on)
  engine(on)
  await $.session.start(sessionStart)

  for (const surface of SURFACES) {
    for (const width of [WIDE, NARROW]) {
      const ui = await $.ui.mount(paneAt(surface, width))
      const phases = await ui.find({ type: 'Box', key: 'phases' })
      const expected = surface === 'mobile' || width <= NARROW ? 'column' : 'row'
      expect(`${surface} ${width}: ${String(phases?.props.flexDirection)}`).toBe(`${surface} ${width}: ${expected}`)
      await ui.unmount()
    }
  }
})

test('a full session draws on every surface at both widths', async ($, on) => {
  mock.clock(on)
  engine(on)
  await $.session.start(sessionStart)
  await $.command.run(typedCommand.commandRun)
  await $.turn.start(typedCommand.turnStart)
  await $.tool.call(write.input)
  await $.tool.call(gitCommit.input)
  await $.tool.call({ ...bashPass.input, command: 'npm test' })
  await $.tool.call(taskCreate.input)

  for (const surface of SURFACES) {
    for (const width of [WIDE, NARROW]) {
      const ui = await $.ui.mount(paneAt(surface, width))
      const shown = await texts(ui)
      for (const text of ['◉ Define', 'Define · since /spec, just now', 'Tasks', 'notes.md', '298bd7b probe: first commit', '✓ npm test · just now']) {
        expect(shown).toContain(text)
      }
      await ui.unmount()
    }
  }
})

test('an empty session draws on every surface at both widths', async ($, on) => {
  mock.clock(on)
  engine(on)
  await $.session.start(sessionStart)

  for (const surface of SURFACES) {
    for (const width of [WIDE, NARROW]) {
      const ui = await $.ui.mount(paneAt(surface, width))
      const shown = await texts(ui)
      for (const text of ['○ Define', 'No phase yet', 'No tasks yet.', 'No activity yet.', 'No files changed yet.', 'No commits yet.', 'No checks run yet.']) {
        expect(shown).toContain(text)
      }
      await ui.unmount()
    }
  }
})

test('a long list is cut to the rows the pane has, with "+N more"', async ($, on) => {
  mock.clock(on)
  engine(on)
  await $.session.start(sessionStart)
  for (let index = 0; index < 30; index++) await $.command.run(run('compact'))

  // 20 rows, wide: 7 fixed lines (phase row, evidence, tasks, the Activity
  // title, and the three empty lists), so Activity has 13 rows: 12 entries
  // and the "+18 more" line.
  const ui = await $.ui.mount(paneAt('desktop', WIDE, 20))
  const shown = await texts(ui)
  expect(shown.filter(text => text === '/compact · just now')).toHaveLength(12)
  expect(shown).toContain('+18 more')
  await ui.unmount()
})

test("/monitor's text summary shows the newest 5 of a list, then \"+N more\"", async ($, on) => {
  mock.clock(on)
  engine(on)
  await $.session.start(sessionStart)
  for (let index = 0; index < 8; index++) await $.command.run(run('compact'))

  // Eight /compact rows and the /monitor row itself.
  const out = await $.command.run(run('monitor'))
  expect(out.text).toContain(
    '\nActivity: /monitor · just now; /compact · just now; /compact · just now; /compact · just now; /compact · just now; +4 more\n',
  )
})
