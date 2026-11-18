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

test("pressing a step shows that step's view, with a button back to the current step, on every surface", async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  await session($, clock)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount(paneAt(surface))
    await ui.press({ key: 'step-plan' })
    const shown = await texts(ui)

    expect(shown).toContain('PLAN')
    expect(shown).toContain('started by /plan · 1 h ago')
    expect(shown).toContain('Files changed · 2')
    expect(shown).toContain('created tasks/plan.md')
    expect(shown).toContain('created tasks/todo.md')
    expect(shown.filter(text => text?.includes('looking back'))).toEqual([])
    expect((await ui.find({ type: 'Button', key: 'back' }))?.text).toBe('Back to Build')
    // Define's and Build's events are not Plan's.
    expect(shown).not.toContain('created SPEC.md')
    expect(shown).not.toContain('edited SPEC.md')
    expect(shown).not.toContain('BUILD')

    await ui.press({ key: 'back' })
    expect(await texts(ui)).toContain('BUILD')
    expect(await ui.find({ type: 'Button', key: 'back' })).toBeUndefined()
    await ui.unmount()
  }
})

test('a file belongs to each step it changed in; so do commits and checks', async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  await session($, clock)

  const ui = await $.ui.mount(paneAt('desktop'))
  await ui.press({ key: 'step-define' })
  expect(await texts(ui)).toContain('created SPEC.md')

  // Build is the current step: pressing it returns to the current view.
  await ui.press({ key: 'step-build' })
  const shown = await texts(ui)
  expect(shown).toContain('BUILD')
  expect(shown).toContain('edited SPEC.md')
  expect(shown).toContain('Commits · 1')
  expect(shown).toContain('✗ tsc')
  await ui.unmount()

  const out = await $.command.run(run('monitor', 'define'))
  expect(out.text).toContain('\nDEFINE\nstarted by /spec · 2 h ago\n')
  expect(out.text).toContain('\nFiles changed · 1\n  created SPEC.md · 2 h ago')
  expect(out.text).not.toContain('Commits')
})

test('pressing the step on show returns to the current step', async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  await session($, clock)

  const ui = await $.ui.mount(paneAt('terminal'))
  await ui.press({ key: 'step-define' })
  expect(await texts(ui)).toContain('DEFINE')
  await ui.press({ key: 'step-define' })
  expect(await texts(ui)).not.toContain('DEFINE')
  expect(await texts(ui)).toContain('BUILD')
  await ui.unmount()
})

test("a step not reached isn't a button; /monitor <step> still shows it", async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  await session($, clock)

  const ui = await $.ui.mount(paneAt('desktop'))
  const pressed = await ui.press({ key: 'step-verify' }).then(
    () => true,
    () => false,
  )
  expect(pressed).toBe(false)
  await ui.unmount()

  const out = await $.command.run(run('monitor', 'verify'))
  expect(out.text).toContain('\nVERIFY\nnot started in this session\n\nNothing changed in this step yet.')
})

test("/monitor <step> on the phone: the step's view as text; build's commit and check are Build's", async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  await session($, clock)

  const plan = await $.command.run(run('monitor', 'Plan'))
  expect(plan.text).toContain('\nPLAN\nstarted by /plan · 1 h ago\n')
  expect(plan.text).toContain('  created tasks/plan.md · 1 h ago')

  const unknown = await $.command.run(run('monitor', 'deploy'))
  expect(unknown.text).toBe('Unknown step "deploy". Use one of: define, plan, build, verify, review, ship.')

  const current = await $.command.run(run('monitor'))
  expect(current.text).toContain('\nBUILD\nstarted by /build · just now\n')
  expect(current.text).toContain('\nChecks · 1, 1 failing\n  ✗ tsc · just now')
  expect(current.text).toContain('\nCommits · 1\n  298bd7b probe: first commit · just now')
})

test('/monitor <step> where a pane is shown opens it on that step', async ($, on) => {
  const clock = mock.clock(on)
  engine(on, { isPlaced: true })
  await session($, clock)

  const out = await $.command.run(run('monitor', 'define'))
  expect(out.text).toBe('Workflow panel opened on Define.')
  const ui = await $.ui.mount(paneAt('desktop'))
  expect(await texts(ui)).toContain('DEFINE')
  expect((await ui.find({ type: 'Button', key: 'back' }))?.text).toBe('Back to Build')
  await ui.unmount()
})
