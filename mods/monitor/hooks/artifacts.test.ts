import { describe, expect, test } from 'claude-code/testing'

import { NO_ARTIFACTS, countTodo, doneFrom, hasSpecIn, isTrackedPath, relativeTo, todoTasksOf } from './artifacts'

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
  test("keep each 'Task' line's title, without ** and cut at ' · ', and whether it's done", () => {
    const text = [
      '# Tasks',
      '- [x] **Task 1: Live event check** · S · Dependencies: none',
      '  - **What:** a probe',
      '- [ ] Task 2: Mod skeleton',
      '### Checkpoint A',
      '- [x] validate, tsc and test pass',
    ].join('\n')

    expect(todoTasksOf(text)).toEqual([
      { title: 'Task 1: Live event check', done: true },
      { title: 'Task 2: Mod skeleton', done: false },
    ])
  })

  test("without any 'Task' lines, every checkbox item is a task", () => {
    expect(todoTasksOf('- [x] write the parser\n- [ ] wire it up')).toEqual([
      { title: 'write the parser', done: true },
      { title: 'wire it up', done: false },
    ])
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
  test('a path inside the working directory becomes relative; one outside stays as it is', () => {
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
