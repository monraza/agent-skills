import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { bashFail, bashPass, gitCommit, sessionStart, taskCreate, typedCommand, write } from './fixtures/live-events'

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
    [bashFail.input.tool_use_id]: bashFail.result,
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
      for (const text of [
        '● Define',
        'DEFINE',
        'started by /spec · just now',
        'edited notes.md',
        'committed 298bd7b probe: first commit',
        '✓ npm test',
        '1 file changed · 1 commit · 1 check · 0/1 tasks',
      ]) {
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
      for (const text of ['○ Define', 'No step yet', 'waiting for an agent-skills command or skill', 'no files changed · no commits · no checks']) {
        expect(shown).toContain(text)
      }
      await ui.unmount()
    }
  }
})

test('Recent shows the newest 4 events; the totals count them all', async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  await $.session.start(sessionStart)
  for (let index = 0; index < 10; index++) {
    await $.tool.call({ ...write.input, tool_use_id: `toolu_write_${index}`, file_path: `${sessionStart.cwd}/file-${index}.md` })
    await clock.advance(60_000)
  }

  const ui = await $.ui.mount(paneAt('desktop', WIDE))
  const shown = await texts(ui)
  expect(shown.filter(text => text?.startsWith('edited '))).toEqual([
    'edited file-9.md',
    'edited file-8.md',
    'edited file-7.md',
    'edited file-6.md',
  ])
  expect(shown).toContain('10 files changed · no commits · no checks')
  await ui.unmount()

  const out = await $.command.run(run('monitor'))
  expect((out.text ?? '').split('\n').filter(line => line.startsWith('  edited '))).toHaveLength(4)
})

test('the pane is drawn with hierarchy and the theme colors, on every surface', async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  await $.session.start(sessionStart)
  await $.command.run(typedCommand.commandRun)
  await $.turn.start(typedCommand.turnStart)
  await $.tool.call({ ...bashPass.input, command: 'npm test' })
  await clock.advance(60_000)
  await $.tool.call({ ...bashFail.input, command: 'tsc' })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount(paneAt(surface, WIDE))
    const props = async (text: string) => (await ui.find({ type: 'Text', text }))?.props ?? {}

    expect(await props('DEFINE')).toMatchObject({ size: 'heading', weight: 'bold', color: 'claude' })
    expect(await props('● Define')).toMatchObject({ weight: 'bold', color: 'claude' })
    expect(await props('○ Plan')).toMatchObject({ dimColor: true })
    expect(await props('✗ tsc')).toMatchObject({ color: 'error' })
    expect(await props('✓ npm test')).toMatchObject({ color: 'success' })
    expect(await props('Recent')).toMatchObject({ size: 'caption', dimColor: true })

    // A blank line between blocks, not before the first.
    expect((await ui.find({ type: 'Box', key: 'phases' }))?.props.marginTop).toBeUndefined()
    for (const key of ['current', 'recent', 'totals']) {
      expect((await ui.find({ type: 'Box', key }))?.props.marginTop).toBe(1)
    }
    await ui.unmount()
  }
})

test('the stepper puts ─ between steps on a row, and none when stacked', async ($, on) => {
  mock.clock(on)
  engine(on)
  await $.session.start(sessionStart)

  const separators = async (surface: (typeof SURFACES)[number], width: number) => {
    const ui = await $.ui.mount(paneAt(surface, width))
    const found = (await ui.findAll({ type: 'Text', text: '─' })).length
    await ui.unmount()

    return found
  }
  expect(await separators('desktop', WIDE)).toBe(5)
  expect(await separators('desktop', NARROW)).toBe(0)
  expect(await separators('mobile', WIDE)).toBe(0)
})
