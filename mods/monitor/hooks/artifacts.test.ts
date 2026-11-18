import { describe, expect, test } from 'claude-code/testing'

import { NO_ARTIFACTS, countTodo, doneFrom, hasSpecIn, isTrackedPath, relativeTo } from './artifacts'

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
    const files = { hasSpec: true, hasPlan: true, todo: { done: 7, total: 7 } }
    expect(doneFrom(files)).toEqual({ define: true, plan: true, build: true, verify: false, review: false, ship: false })
  })

  test('a todo list with an open item, or no items, is not done', () => {
    expect(doneFrom({ ...NO_ARTIFACTS, todo: { done: 3, total: 7 } }).build).toBe(false)
    expect(doneFrom({ ...NO_ARTIFACTS, todo: { done: 0, total: 0 } }).build).toBe(false)
  })
})
