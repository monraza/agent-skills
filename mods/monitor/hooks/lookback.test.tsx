import { expect, mock, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import type { On } from 'claude-code'

import { bashFail, edit, gitCommit, sessionStart, typedCommand, write } from './fixtures/live-events'

const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const
const MINUTE = 60_000
const CWD = sessionStart.cwd

const paneAt = (surface: (typeof SURFACES)[number]) =>
  ({
    plugin: 'monitor',
    component: 'Pane',
    requestId: 'monitor',
    surface,
    props: {
      title: 'Workflow',
      isFocused: false,
      bodyColumns: 80,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 40 },
      view: {},
    },
  }) as const

const engine = (on: On, { isPlaced = false } = {}) => {
  on('command.register', () => ({ value: { command: 'monitor' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: CWD }))
  on('command.run', () => typedCommand.commandResult)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', (_, e) =>
    (e.tool === 'Write'
      ? write.result
      : e.tool === 'Edit'
        ? edit.result
        : e.tool === 'Bash' && e.command === gitCommit.input.command
          ? gitCommit.result
          : bashFail.result) as typeof write.result,
  )
  on('ui.open', () => ({ value: isPlaced ? { isPlaced: true } : { isPlaced: false, reason: 'no-surface: no surface is attached' } }))
}

const run = (command: string, args = '') => ({ ...typedCommand.commandRun, command, args })
const writeFile = (path: string) => ({ ...write.input, tool_use_id: `toolu_${path}`, file_path: `${CWD}/${path}` })
const editFile = (path: string) => ({ ...edit.input, tool_use_id: `toolu_edit_${path}`, file_path: `${CWD}/${path}` })

// Define (2 h ago): /spec, created SPEC.md. Plan (1 h ago): /plan, created
// tasks/plan.md and tasks/todo.md. Build (now): /build, edited SPEC.md, a
// commit, a failing tsc.
const session = async ($: Engine, clock: MockClock) => {
  await $.session.start(sessionStart)
  await $.command.run(run('spec'))
  await $.tool.call(writeFile('SPEC.md'))
  await clock.advance(60 * MINUTE)
  await $.command.run(run('plan'))
  await $.tool.call(writeFile('tasks/plan.md'))
  await $.tool.call(writeFile('tasks/todo.md'))
  await clock.advance(60 * MINUTE)
  await $.command.run(run('build'))
  await $.tool.call(editFile('SPEC.md'))
  await $.tool.call(gitCommit.input)
  await $.tool.call({ ...bashFail.input, command: 'tsc' })
}

const texts = async (ui: { findAll: (q: { type: string }) => Promise<readonly { text?: string }[]> }) =>
  (await ui.findAll({ type: 'Text' })).map(one => one.text)

test("pressing a step shows that step's files and activity, on every surface", async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  await session($, clock)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount(paneAt(surface))
    await ui.press({ key: 'step-plan' })
    const shown = await texts(ui)

    expect(shown).toContain('PLAN · looking back')
    expect(shown).toContain('started by /plan · 1 h ago')
    expect(shown).toContain('created tasks/plan.md')
    expect(shown).toContain('created tasks/todo.md')
    expect(shown).toContain('/plan')
    // Define's and Build's events are not Plan's.
    expect(shown).not.toContain('created SPEC.md')
    expect(shown).not.toContain('edited SPEC.md')
    expect(shown).not.toContain('/build')

    await ui.press({ key: 'back' })
    expect(await texts(ui)).toContain('BUILD')
    await ui.unmount()
  }
})

test("a file belongs to each step it changed in; the step's commits and checks are its activity", async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  await session($, clock)

  const ui = await $.ui.mount(paneAt('desktop'))
  await ui.press({ key: 'step-define' })
  expect(await texts(ui)).toContain('created SPEC.md')

  await ui.press({ key: 'step-build' })
  // Build is the current step: pressing it returns to the normal view.
  expect(await texts(ui)).toContain('BUILD')
  expect(await texts(ui)).not.toContain('BUILD · looking back')
  await ui.unmount()

  const out = await $.command.run(run('monitor', 'define'))
  expect(out.text).toContain('\nDEFINE · looking back\nstarted by /spec · 2 h ago\n')
  expect(out.text).toContain('\nFiles\n  created SPEC.md · 2 h ago\n')
  expect(out.text).toContain('\nActivity\n  /spec · 2 h ago')
})

test('pressing the step being viewed returns to the current step', async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  await session($, clock)

  const ui = await $.ui.mount(paneAt('terminal'))
  await ui.press({ key: 'step-define' })
  expect(await texts(ui)).toContain('DEFINE · looking back')
  await ui.press({ key: 'step-define' })
  expect(await texts(ui)).not.toContain('DEFINE · looking back')
  await ui.unmount()
})

test('a step with nothing recorded says so', async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  await session($, clock)

  const ui = await $.ui.mount(paneAt('desktop'))
  await ui.press({ key: 'step-verify' })
  const shown = await texts(ui)
  expect(shown).toContain('VERIFY · looking back')
  expect(shown).toContain('not started in this session')
  expect(shown).toContain('Nothing recorded for this step yet.')
  await ui.unmount()
})

test("/monitor <step> on the phone: the step's view as text; build's commit and check are Build's", async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  await session($, clock)

  const plan = await $.command.run(run('monitor', 'Plan'))
  expect(plan.text).toContain('\nPLAN · looking back\n')
  expect(plan.text).toContain('  created tasks/plan.md · 1 h ago')

  const unknown = await $.command.run(run('monitor', 'deploy'))
  expect(unknown.text).toBe('Unknown step "deploy". Use one of: define, plan, build, verify, review, ship.')

  const current = await $.command.run(run('monitor'))
  expect(current.text).toContain('\nBUILD\nstarted by /build · just now\n')
  expect(current.text).toContain('  ✗ tsc · just now')
  expect(current.text).toContain('  committed 298bd7b probe: first commit · just now')
})

test('/monitor <step> where a pane is shown opens it on that step', async ($, on) => {
  const clock = mock.clock(on)
  engine(on, { isPlaced: true })
  await session($, clock)

  const out = await $.command.run(run('monitor', 'define'))
  expect(out.text).toBe('Workflow panel opened, looking back at Define.')
  const ui = await $.ui.mount(paneAt('desktop'))
  expect(await texts(ui)).toContain('DEFINE · looking back')
  await ui.unmount()
})
