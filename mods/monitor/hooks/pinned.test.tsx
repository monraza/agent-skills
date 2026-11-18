import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { sessionStart, typedCommand, write } from './fixtures/live-events'

const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const
const CWD = sessionStart.cwd
const ROWS = 14

const paneAt = (surface: (typeof SURFACES)[number], bodyColumns = 80) =>
  ({
    plugin: 'monitor',
    component: 'Pane',
    requestId: 'monitor',
    surface,
    props: {
      title: 'Workflow',
      isFocused: true,
      bodyColumns,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: ROWS },
      view: {},
    },
  }) as const

// `moved` collects each offset the engine's own window would move to.
const engine = (on: On, moved: number[] = []) => {
  on('ui.scroll', (_, e) => {
    moved.push(e.offset)

    return {}
  })
  on('command.register', () => ({ value: { command: 'monitor' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: CWD }))
  on('command.run', () => typedCommand.commandResult)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', () => write.result)
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'no-surface: no surface is attached' } }))
}

// /spec, then 30 files written: far more rows than the pane has.
const longSession = async ($: Engine, clock: { advance: (ms: number) => Promise<void> }) => {
  await $.session.start(sessionStart)
  await $.command.run({ ...typedCommand.commandRun, command: 'spec', args: '' })
  for (let index = 0; index < 30; index++) {
    await $.tool.call({ ...write.input, tool_use_id: `toolu_${index}`, file_path: `${CWD}/file-${index}.md` })
    await clock.advance(1000)
  }
}

// The person's wheel over the pane: `by` rows, negative toward the top.
const wheel = ($: Engine, by: number) =>
  $.ui.scroll({ component: 'Pane', requestId: 'monitor', offset: 0, by, bodyRows: ROWS, contentRows: ROWS, origin: { kind: 'person' } })

const texts = async (ui: { findAll: (q: { type: string }) => Promise<readonly { text?: string }[]> }) =>
  (await ui.findAll({ type: 'Text' })).map(one => one.text)

test('the pane draws no more rows than it has, the stepper first, on every surface', async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  await longSession($, clock)

  for (const surface of SURFACES) {
    for (const width of [80, 40]) {
      const ui = await $.ui.mount(paneAt(surface, width))
      const shown = await texts(ui)
      expect(shown[0]).toBe('● Define')
      expect(shown).toContain('DEFINE')
      expect(shown).toContain('created file-29.md')
      expect(shown).not.toContain('created file-0.md')
      // Each body row is one Text, or one row of Texts; the stepper's
      // steps and separators count once per row.
      const body = await ui.find({ type: 'Box', key: 'body' })
      expect(`${surface} ${width}: ${String(body?.props.flexDirection)}`).toBe(`${surface} ${width}: column`)
      await ui.unmount()
    }
  }
})

test("scrolling moves the rows under the stepper and the step's header, which stay at the top", async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  await longSession($, clock)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount(paneAt(surface))
    await wheel($, 3)
    let shown = await texts(ui)
    expect(shown[0]).toBe('● Define')
    expect(shown).toContain('DEFINE')
    expect(shown).not.toContain('Files changed · 30')
    expect(shown).not.toContain('created file-29.md')

    // Past the end it stops at the last row; past the start, at the first.
    await wheel($, 1000)
    shown = await texts(ui)
    expect(shown[0]).toBe('● Define')
    expect(shown).toContain('created file-0.md')
    expect(shown).not.toContain('created file-29.md')

    await wheel($, -1000)
    shown = await texts(ui)
    expect(shown).toContain('Files changed · 30')
    expect(shown).toContain('created file-29.md')
    await ui.unmount()
  }
})

test("the engine's own window never moves: the hook keeps it", async ($, on) => {
  const clock = mock.clock(on)
  const moved: number[] = []
  engine(on, moved)
  await longSession($, clock)

  const ui = await $.ui.mount(paneAt('desktop'))
  expect(await wheel($, 5)).toEqual({})
  expect(moved).toEqual([])
  await ui.unmount()
})

test('showing another step starts it at the top', async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  await longSession($, clock)
  await $.command.run({ ...typedCommand.commandRun, command: 'plan', args: '' })

  const ui = await $.ui.mount(paneAt('desktop'))
  await ui.press({ key: 'step-define' })
  await wheel($, 1000)
  expect(await texts(ui)).not.toContain('created file-29.md')
  // The button back stays with the pinned header.
  await ui.press({ key: 'back' })
  expect(await texts(ui)).toContain('PLAN')
  await ui.press({ key: 'step-define' })
  expect(await texts(ui)).toContain('created file-29.md')
  await ui.unmount()
})
