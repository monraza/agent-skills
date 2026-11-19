import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { edit, sessionStart, turnStart, typedCommand } from './fixtures/live-events'

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
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const CWD = sessionStart.cwd

const todo = (done: number, total: number) =>
  Array.from({ length: total }, (_, index) => `- [${index < done ? 'x' : ' '}] task ${index + 1}`).join('\n')

// A repository at CWD, answered from memory. The mod asks with absolute
// paths; `files` is keyed by the path relative to CWD.
const fakeRepo = (on: On, files: Map<string, string>) => {
  const reads: string[] = []
  const relative = (path: string) => (path === CWD ? '' : path.replace(`${CWD}/`, ''))
  const isDir = (path: string) => [...files.keys()].some(file => file.startsWith(path === '' ? '' : `${path}/`))
  on('fs.exists', (_, e) => ({ value: files.has(relative(e.path)) || isDir(relative(e.path)) }))
  on('fs.list', (_, e) => {
    const folder = relative(e.path)
    const prefix = folder === '' ? '' : `${folder}/`
    const names = [...files.keys()]
      .filter(file => file.startsWith(prefix) && !file.slice(prefix.length).includes('/'))
      .map(file => file.slice(prefix.length))

    return { value: names.map(name => ({ name, kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false })) }
  })
  on('fs.read', (_, e) => {
    reads.push(e.path)

    return { value: files.get(relative(e.path)) ?? '' }
  })

  return reads
}

const engine = (on: On) => {
  on('command.register', () => ({ value: { command: 'monitor' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: CWD }))
  on('command.run', () => typedCommand.commandResult)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', () => edit.result)
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'no-surface: no surface is attached' } }))
}

const texts = async (ui: { findAll: (q: { type: string }) => Promise<readonly { text?: string }[]> }) =>
  (await ui.findAll({ type: 'Text' })).map(one => one.text)

const fullRepo = () =>
  new Map([
    ['SPEC.md', '# Spec'],
    ['tasks/plan.md', '# Plan'],
    ['tasks/todo.md', todo(3, 7)],
  ])

test('a repo with a spec, a plan and 3 of 7 todos shows Define ✓, Plan ✓ and Build 3/7 at session start', async ($, on) => {
  mock.clock(on)
  fakeRepo(on, fullRepo())
  engine(on)
  await $.session.start(sessionStart)

  const ui = await $.ui.mount(PANE)
  const shown = await texts(ui)
  expect(shown).toContain('✓ Define')
  expect(shown).toContain('✓ Plan')
  expect(shown).toContain('○ Build 3/7')
  expect(shown).toContain('No step yet')
  await ui.unmount()
})

test('Define and Plan show their documents, written before this session', async ($, on) => {
  mock.clock(on)
  fakeRepo(on, fullRepo())
  engine(on)
  await $.session.start(sessionStart)

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'step-define' })
  expect(await texts(ui)).toContain('SPEC.md')
  await ui.press({ key: 'step-plan' })
  expect(await texts(ui)).toContain('tasks/plan.md')
  expect(await texts(ui)).toContain('tasks/todo.md')
  await ui.unmount()

  const out = await $.command.run({ ...typedCommand.commandRun, command: 'monitor', args: 'define' })
  expect(out.text).toContain('\nDocuments\n  SPEC.md')
})

test("Build shows the current task with its details from a heading-style todo, wrapped to the pane", async ($, on) => {
  mock.clock(on)
  const long = 'Every acceptance criterion of this task is written out at length so that it cannot fit on one row of the pane'
  fakeRepo(
    on,
    new Map([
      ['SPEC.md', '# Spec'],
      ['tasks/plan.md', '# Plan'],
      [
        'tasks/todo.md',
        [
          '## Task 1: Schema',
          '- [x] tables exist',
          '## Task 2: API endpoints',
          '**Acceptance criteria:**',
          '- [x] list endpoint',
          '- [ ] create endpoint',
          `- [ ] ${long}`,
          '**Files likely touched:**',
          '- `src/api.ts`',
          '## Task 3: UI',
          '- [ ] form',
        ].join('\n'),
      ],
    ]),
  )
  engine(on)
  await $.session.start(sessionStart)
  await $.command.run({ ...typedCommand.commandRun, command: 'build', args: '' })

  const ui = await $.ui.mount(PANE)
  const shown = await texts(ui)
  expect(shown).toContain('● Build 1/3')
  expect(shown).toContain('Current task · 1 of 3 done')
  expect(shown).toContain('● 2. API endpoints')
  expect(shown).toContain('Acceptance criteria:')
  expect(shown).toContain('✓ list endpoint')
  expect(shown).toContain('○ create endpoint')
  expect(shown).toContain('• src/api.ts')
  expect(shown).not.toContain('● 3. UI')
  // The long criterion wraps into rows that fit the pane, and nothing is lost.
  const wrapped = shown.filter(
    text => text !== undefined && (text.startsWith(`○ ${long.slice(0, 10)}`) || (text.trim() !== '' && long.includes(text.trim()))),
  )
  expect(wrapped.length).toBeGreaterThan(1)
  expect(wrapped.every(text => (text ?? '').length <= PANE.props.bodyColumns)).toBe(true)
  expect(wrapped.join(' ').replace(/\s+/g, ' ')).toBe(`○ ${long}`)
  await ui.unmount()
})

test('checking a todo item with Edit updates Build after that call', async ($, on) => {
  mock.clock(on)
  const files = fullRepo()
  fakeRepo(on, files)
  engine(on)
  await $.session.start(sessionStart)

  files.set('tasks/todo.md', todo(4, 7))
  await $.tool.call({ ...edit.input, file_path: `${CWD}/tasks/todo.md` })

  const ui = await $.ui.mount(PANE)
  expect(await texts(ui)).toContain('○ Build 4/7')
  await ui.unmount()
})

test('an Edit to an untracked file does not re-read anything', async ($, on) => {
  mock.clock(on)
  const reads = fakeRepo(on, fullRepo())
  engine(on)
  await $.session.start(sessionStart)
  const before = reads.length

  await $.tool.call(edit.input)

  expect(reads.length).toBe(before)
})

test('a turn start re-reads the files', async ($, on) => {
  mock.clock(on)
  const files = new Map([['SPEC.md', '# Spec']])
  fakeRepo(on, files)
  engine(on)
  await $.session.start(sessionStart)

  files.set('tasks/plan.md', '# Plan')
  await $.turn.start(turnStart)

  const ui = await $.ui.mount(PANE)
  expect(await texts(ui)).toContain('✓ Plan')
  await ui.unmount()
})

test('a fully checked todo list marks Build done', async ($, on) => {
  mock.clock(on)
  fakeRepo(on, new Map([['tasks/todo.md', todo(7, 7)]]))
  engine(on)
  await $.session.start(sessionStart)

  const ui = await $.ui.mount(PANE)
  expect(await texts(ui)).toContain('✓ Build 7/7')
  await ui.unmount()
})

test('the active phase shows as active even when its file says done', async ($, on) => {
  mock.clock(on)
  fakeRepo(on, fullRepo())
  engine(on)
  await $.session.start(sessionStart)
  await $.command.run(typedCommand.commandRun)
  await $.turn.start(typedCommand.turnStart)

  const ui = await $.ui.mount(PANE)
  const shown = await texts(ui)
  expect(shown).toContain('● Define')
  expect(shown).toContain('✓ Plan')
  await ui.unmount()
})

test("/monitor's text summary shows the same marks", async ($, on) => {
  mock.clock(on)
  fakeRepo(on, fullRepo())
  engine(on)
  await $.session.start(sessionStart)

  const out = await $.command.run({ ...typedCommand.commandRun, command: 'monitor', args: '' })
  expect(out.text).toContain('✓ Define ─ ✓ Plan ─ ○ Build 3/7 ─')
})

test('tool.call passes through unchanged', async ($, on) => {
  mock.clock(on)
  fakeRepo(on, fullRepo())
  engine(on)
  await $.session.start(sessionStart)

  expect(await $.tool.call({ ...edit.input, file_path: `${CWD}/tasks/todo.md` })).toEqual(edit.result)
})

test("Plan's view shows the todo's tasks in groups that fold; Completed starts folded", async ($, on) => {
  mock.clock(on)
  fakeRepo(on, fullRepo())
  engine(on)
  await $.session.start(sessionStart)
  await $.command.run({ ...typedCommand.commandRun, command: 'build', args: '' })
  await $.turn.start({ ...typedCommand.turnStart, turnId: 'turn-build' })

  const ui = await $.ui.mount(PANE)
  expect(await texts(ui)).toContain('● Build 3/7')
  expect(await texts(ui)).not.toContain('Tasks · 3 of 7 done')
  await ui.press({ key: 'step-plan' })
  const shown = await texts(ui)
  expect(shown).toContain('Tasks · 3 of 7 done')
  expect(shown).toContain('▸ Completed · 3')
  expect(shown).not.toContain('✓ 3. task 3')
  expect(shown).toContain('▾ In progress · 1')
  expect(shown).toContain('● 4. task 4')
  expect(shown).toContain('▾ To do · 3')
  expect(shown).toContain('○ 7. task 7')
  // Completed above, in progress in the middle, to do at the bottom.
  expect(shown.indexOf('▸ Completed · 3')).toBeLessThan(shown.indexOf('● 4. task 4'))
  expect(shown.indexOf('● 4. task 4')).toBeLessThan(shown.indexOf('○ 7. task 7'))

  await ui.press({ key: 'group-completed' })
  expect(await texts(ui)).toContain('▾ Completed · 3')
  expect(await texts(ui)).toContain('✓ 3. task 3')
  await ui.press({ key: 'group-todo' })
  expect(await texts(ui)).toContain('▸ To do · 3')
  expect(await texts(ui)).not.toContain('○ 7. task 7')
  await ui.unmount()
})
