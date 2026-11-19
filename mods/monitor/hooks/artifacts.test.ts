import { describe, expect, test } from 'claude-code/testing'

import {
  NO_ARTIFACTS,
  countTasks,
  countTodo,
  doneFrom,
  hasSpecIn,
  isTrackedPath,
  relativeTo,
  specPathsIn,
  tasksOf,
  todoTasksOf,
} from './artifacts'

describe('todo counting', () => {
  test('counts checkbox items, nested or not, and ignores other lines', () => {
    const text = [
      '# Tasks',
      '- [ ] open',
      '- [x] done',
      '  - [X] nested and done',
      '* [ ] star bullet',
      '+ [x] plus bullet',
      'plain line',
      '- [] not a box',
      '[x] no bullet',
      '- [x]no space after the box',
    ].join('\n')

    expect(countTodo(text)).toEqual({ done: 3, total: 5 })
  })

  test('an empty file has no items', () => {
    expect(countTodo('')).toEqual({ done: 0, total: 0 })
  })

  test("counts only the 'Task' lines when there are any, so checkpoint items don't count", () => {
    const text = ['- [x] **Task 1: One** · S', '- [ ] Task 2: Two', '### Checkpoint', '- [x] Tests pass', '- [ ] Human review'].join('\n')

    expect(countTodo(text)).toEqual({ done: 1, total: 2 })
  })
})

describe('todo task lines', () => {
  test("keep each 'Task' line's number and title, without ** and cut at ' · ', and whether it's done", () => {
    const text = [
      '# Tasks',
      '- [x] **Task 1: Live event check** · S · Dependencies: none',
      '  - **What:** a probe',
      '- [ ] Task 2a: Mod skeleton',
      '### Checkpoint A',
      '- [x] validate, tsc and test pass',
    ].join('\n')

    expect(todoTasksOf(text)).toEqual([
      { number: '1', title: 'Live event check', done: true, started: false, details: ['- **What:** a probe'] },
      { number: '2a', title: 'Mod skeleton', done: false, started: false, details: [] },
    ])
    expect(todoTasksOf('- [ ] Task 3')).toEqual([{ number: '3', title: 'Task 3', done: false, started: false, details: [] }])
  })

  test("without any 'Task' lines or headings, every checkbox item is a task, numbered by its place", () => {
    expect(todoTasksOf('- [x] write the parser\n- [ ] wire it up')).toEqual([
      { number: '1', title: 'write the parser', done: true, started: false, details: [] },
      { number: '2', title: 'wire it up', done: false, started: false, details: [] },
    ])
  })

  test("the planning skill's '## Task N:' headings: one task each, done when every box under it is checked", () => {
    const text = [
      '# Todo',
      '## Task 1: Set up the schema',
      '**Acceptance criteria:**',
      '- [x] tables exist',
      '- [x] migrations run',
      '**Verification:**',
      '- [x] Tests pass',
      '## Task 2: API endpoints',
      '- [x] list endpoint',
      '- [ ] create endpoint',
      '### Notes',
      '- [ ] a box under a deeper heading is still Task 2\'s',
      '## Checkpoint: After Tasks 1-2',
      '- [ ] All tests pass',
      '## **Task 3** — UI',
      '- [ ] form',
      '### Task 4. Docs',
      '',
    ].join('\n')

    expect(todoTasksOf(text)).toEqual([
      {
        number: '1',
        title: 'Set up the schema',
        done: true,
        started: true,
        details: ['**Acceptance criteria:**', '- [x] tables exist', '- [x] migrations run', '**Verification:**', '- [x] Tests pass'],
      },
      {
        number: '2',
        title: 'API endpoints',
        done: false,
        started: true,
        details: ['- [x] list endpoint', '- [ ] create endpoint', '### Notes', "- [ ] a box under a deeper heading is still Task 2's"],
      },
      { number: '3', title: 'UI', done: false, started: false, details: ['- [ ] form'] },
      { number: '4', title: 'Docs', done: false, started: false, details: [] },
    ])
    // Was 3/7 with every box counted (Build 0/85 on a real plan).
    expect(countTodo(text)).toEqual({ done: 1, total: 4 })
  })

  test("a 'Task' line's details are the lines indented under it, down to the next line that isn't", () => {
    const text = [
      '- [x] **Task 1: Live event check** · S',
      '  - **What:** a probe',
      '',
      '    - records events',
      '  - **Files:** `fixtures/live-events.ts`',
      '- [ ] Task 2: Mod skeleton',
      '  - [x] registers /monitor',
      '  - [ ] opens the pane',
      '### Checkpoint A',
      '- [x] validate passes',
    ].join('\n')

    expect(todoTasksOf(text).map(task => task.details)).toEqual([
      ['- **What:** a probe', '  - records events', '- **Files:** `fixtures/live-events.ts`'],
      ['- [x] registers /monitor', '- [ ] opens the pane'],
    ])
  })

  test('a task keeps at most 30 lines of details, then …', () => {
    const text = ['## Task 1: Long', ...Array.from({ length: 40 }, (_, index) => `- [ ] criterion ${index + 1}`)].join('\n')
    const [task] = todoTasksOf(text)

    expect(task?.details).toHaveLength(31)
    expect(task?.details.at(29)).toBe('- [ ] criterion 30')
    expect(task?.details.at(30)).toBe('…')
  })

  test("'Task' checkbox lines win over headings when a todo has both", () => {
    const text = ['## Task 1: One', '- [x] criterion', '## Task list', '- [x] Task 1: One', '- [ ] Task 2: Two'].join('\n')

    expect(countTodo(text)).toEqual({ done: 1, total: 2 })
  })
})

describe('tasks added to the plan alone', () => {
  const TODO = ['- [x] Task 1: Schema', '- [ ] Task 3: UI'].join('\n')
  const PLAN = [
    '## Task List',
    '- [ ] Task 1: Schema and seed data',
    '- [ ] Task 2: Search',
    '  - [ ] finds by title',
    '- [ ] Task 3: UI',
    '- [ ] Task 4: Export',
  ].join('\n')

  test('a numbered task the plan has and the todo lacks joins in number order, with its details', () => {
    const tasks = tasksOf(TODO, PLAN)
    expect(tasks.map(task => `${task.number}. ${task.title}`)).toEqual(['1. Schema', '2. Search', '3. UI', '4. Export'])
    expect(tasks[1]?.details).toEqual(['- [ ] finds by title'])
    expect(countTasks(tasks)).toEqual({ done: 1, total: 4 })
  })

  test('a task in both comes from the todo', () => {
    const first = tasksOf(TODO, PLAN)[0]
    expect(first?.title).toBe('Schema')
    expect(first?.done).toBe(true)
  })

  test("an added task with a '## Task N:' section in the plan takes its details from there", () => {
    const plan = [...PLAN.split('\n'), '', '## Task 4: Export', '**Acceptance criteria:**', '- [ ] CSV download works'].join('\n')
    const added = tasksOf(TODO, plan).find(task => task.number === '4')
    expect(added?.details).toEqual(['**Acceptance criteria:**', '- [ ] CSV download works'])
    expect(added?.done).toBe(false)
  })

  test('a plan written with headings alone adds its numbered sections too, in order', () => {
    const plan = ['## Task 1: Schema', '- [x] tables', '## Task 2a: Search', '- [ ] finds by title'].join('\n')
    expect(tasksOf(TODO, plan).map(task => task.number)).toEqual(['1', '2a', '3'])
  })

  test('a todo numbered by place stands alone, as does a todo with no plan or a plan without numbered tasks', () => {
    const byPlace = ['- [ ] schema', '- [ ] api'].join('\n')
    expect(tasksOf(byPlace, PLAN)).toEqual(todoTasksOf(byPlace))
    expect(tasksOf(TODO, null)).toEqual(todoTasksOf(TODO))
    expect(tasksOf(TODO, '# Plan\n- [ ] Task list reviewed\n- [ ] something')).toEqual(todoTasksOf(TODO))
  })
})

describe('spec detection', () => {
  const none = { root: [], docs: [], spec: [] }

  test('finds a spec at each path /build accepts', () => {
    expect(hasSpecIn({ ...none, root: ['README.md', 'SPEC.md'] })).toBe(true)
    expect(hasSpecIn({ ...none, root: ['SPEC-ocr.md'] })).toBe(true)
    expect(hasSpecIn({ ...none, docs: ['SPEC.md'] })).toBe(true)
    expect(hasSpecIn({ ...none, spec: ['billing.md'] })).toBe(true)
  })

  test("lists each spec's path, SPEC.md first", () => {
    expect(specPathsIn({ root: ['README.md', 'SPEC-ocr.md', 'SPEC.md'], docs: ['SPEC.md'], spec: ['billing.md', 'auth.md'] })).toEqual([
      'SPEC.md',
      'SPEC-ocr.md',
      'docs/SPEC.md',
      'spec/auth.md',
      'spec/billing.md',
    ])
    expect(specPathsIn(none)).toEqual([])
  })

  test('finds nothing elsewhere', () => {
    expect(hasSpecIn(none)).toBe(false)
    expect(hasSpecIn({ ...none, root: ['SPECS.md', 'spec.md', 'SPEC-.md', 'SPEC-x.txt'] })).toBe(false)
    expect(hasSpecIn({ ...none, docs: ['SPEC-ocr.md'] })).toBe(false)
  })
})

describe('tracked paths', () => {
  test('are the spec paths, the plan and the todo list', () => {
    for (const path of ['SPEC.md', 'SPEC-ocr.md', 'docs/SPEC.md', 'spec/billing.md', 'tasks/plan.md', 'tasks/todo.md']) {
      expect(isTrackedPath(path)).toBe(true)
    }
    for (const path of ['tasks/notes.md', 'src/SPEC.md', 'README.md', '/elsewhere/SPEC.md']) {
      expect(isTrackedPath(path)).toBe(false)
    }
  })
})

describe('relative paths', () => {
  test('a path inside the project root becomes relative; one outside stays as it is', () => {
    expect(relativeTo('/home/user/project', '/home/user/project/tasks/todo.md')).toBe('tasks/todo.md')
    expect(relativeTo('/home/user/project/', '/home/user/project/SPEC.md')).toBe('SPEC.md')
    expect(relativeTo('/home/user/project', '/home/user/project-two/SPEC.md')).toBe('/home/user/project-two/SPEC.md')
    expect(relativeTo('/home/user/project', '/tmp/notes.md')).toBe('/tmp/notes.md')
  })
})

describe('done marks', () => {
  test('come from the spec, the plan and a fully checked todo list', () => {
    expect(doneFrom(NO_ARTIFACTS)).toEqual({
      define: false,
      plan: false,
      build: false,
      verify: false,
      review: false,
      ship: false,
    })
    const files = { ...NO_ARTIFACTS, hasSpec: true, hasPlan: true, todo: { done: 7, total: 7 } }
    expect(doneFrom(files)).toEqual({ define: true, plan: true, build: true, verify: false, review: false, ship: false })
  })

  test('a todo list with an open item, or no items, is not done', () => {
    expect(doneFrom({ ...NO_ARTIFACTS, todo: { done: 3, total: 7 } }).build).toBe(false)
    expect(doneFrom({ ...NO_ARTIFACTS, todo: { done: 0, total: 0 } }).build).toBe(false)
  })
})
