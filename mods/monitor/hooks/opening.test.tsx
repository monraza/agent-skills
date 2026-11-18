import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { sessionStart, skillPrompt, turnStart, typedCommand } from './fixtures/live-events'

const CWD = sessionStart.cwd

// A working directory holding `files` (paths relative to CWD), and an engine
// that counts the panes opened.
const setup = (on: On, files: readonly string[], { openFails = false } = {}) => {
  const relative = (path: string) => (path === CWD ? '' : path.replace(`${CWD}/`, ''))
  const under = (folder: string) => files.filter(file => folder === '' || file.startsWith(`${folder}/`))
  on('session.cwd', () => ({ value: CWD }))
  on('fs.exists', (_, e) => ({ value: files.includes(relative(e.path)) || under(relative(e.path)).length > 0 }))
  on('fs.list', (_, e) => {
    const folder = relative(e.path)
    const prefix = folder === '' ? '' : `${folder}/`
    const names = under(folder)
      .map(file => file.slice(prefix.length))
      .filter(name => !name.includes('/'))

    return { value: names.map(name => ({ name, kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false })) }
  })
  on('fs.read', () => ({ value: '' }))
  on('command.register', () => ({ value: { command: 'monitor' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.run', () => typedCommand.commandResult)
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  const opened: string[] = []
  on('ui.open', (_, e) => {
    if (openFails) throw new Error('no pane for you')
    opened.push(e.id)

    return { value: { isPlaced: true } }
  })

  return opened
}

const run = (command: string) => ({ ...typedCommand.commandRun, command, args: '' })

test('in a directory with a spec, the pane opens at session start', async ($, on) => {
  const clock = mock.clock(on)
  const opened = setup(on, ['SPEC.md'])
  await $.session.start(sessionStart)
  await clock.settle()

  expect(opened).toEqual(['monitor'])
})

test('in a directory with a tasks/ folder, the pane opens at session start', async ($, on) => {
  const clock = mock.clock(on)
  const opened = setup(on, ['tasks/notes.md'])
  await $.session.start(sessionStart)
  await clock.settle()

  expect(opened).toEqual(['monitor'])
})

test('elsewhere it waits for the first phase-table command, then opens once', async ($, on) => {
  const clock = mock.clock(on)
  const opened = setup(on, ['README.md'])
  await $.session.start(sessionStart)
  await $.command.run(run('compact'))
  await clock.settle()
  expect(opened).toEqual([])

  await $.command.run(run('spec'))
  await $.command.run(run('plan'))
  await clock.settle()
  expect(opened).toEqual(['monitor'])
})

test('a phase-table skill opens it, but a skill outside the table does not', async ($, on) => {
  const clock = mock.clock(on)
  const opened = setup(on, [])
  await $.session.start(sessionStart)
  await $.turn.start(turnStart)
  await $.skill.prompt(skillPrompt)
  await clock.settle()
  expect(opened).toEqual([])

  await $.skill.prompt({ ...skillPrompt, skill: 'agent-skills:test-driven-development' })
  await clock.settle()
  expect(opened).toEqual(['monitor'])
})

test('a phase-less command from the table opens it too', async ($, on) => {
  const clock = mock.clock(on)
  const opened = setup(on, [])
  await $.session.start(sessionStart)
  await $.command.run(run('constraints'))
  await clock.settle()

  expect(opened).toEqual(['monitor'])
})

test('it opens on its own at most once, even across a reload', async ($, on) => {
  const clock = mock.clock(on)
  const opened = setup(on, ['SPEC.md'])
  await $.session.start(sessionStart)
  await clock.settle()
  // A reload runs session.start again; the session's state remembers the open.
  await $.session.start(sessionStart)
  await $.command.run(run('build'))
  await clock.settle()

  expect(opened).toEqual(['monitor'])
})

test('once /monitor has opened it, nothing else opens it again; /monitor always does', async ($, on) => {
  const clock = mock.clock(on)
  const opened = setup(on, [])
  await $.session.start(sessionStart)
  await $.command.run(run('monitor'))
  await $.command.run(run('spec'))
  await clock.settle()
  expect(opened).toEqual(['monitor'])

  await $.command.run(run('monitor'))
  expect(opened).toEqual(['monitor', 'monitor'])
})

test('opening late shows everything since session start', async ($, on) => {
  const clock = mock.clock(on)
  setup(on, [])
  await $.session.start(sessionStart)
  await $.command.run(run('compact'))
  await clock.settle()

  const out = await $.command.run(run('monitor'))
  expect(out.text).toBe('Workflow panel opened.')
  const ui = await $.ui.mount({
    plugin: 'monitor',
    component: 'Pane',
    requestId: 'monitor',
    surface: 'desktop',
    props: { title: 'Workflow', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  })
  expect((await ui.findAll({ type: 'Text' })).map(one => one.text)).toContain('/compact · just now')
  await ui.unmount()
})

test('a failed open does not stop the command', async ($, on) => {
  mock.clock(on)
  setup(on, [], { openFails: true })
  await $.session.start(sessionStart)

  expect(await $.command.run(run('spec'))).toEqual(typedCommand.commandResult)
})
