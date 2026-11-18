import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { NO_ARTIFACTS } from './artifacts'
import { sessionStart, taskCreate, taskUpdate, typedCommand } from './fixtures/live-events'
import { sectionsOf } from './sections'
import { taskCounts, taskCreated, taskUpdated, todosWritten } from './tasks'

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
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

// The recorded TaskCreate and TaskUpdate calls, and variants of them.
const createSecond = {
  input: { ...taskCreate.input, tool_use_id: 'toolu_create_2', subject: 'Second task' },
  result: { ...taskCreate.result, result: { task: { ...taskCreate.result.result.task, id: '2', subject: 'Second task' } } },
}
const complete = {
  input: { ...taskUpdate.input, tool_use_id: 'toolu_complete_1', status: 'completed' },
  result: {
    ...taskUpdate.result,
    result: { ...taskUpdate.result.result, statusChange: { from: 'in_progress', to: 'completed' } },
  },
} as const
const deleteSecond = {
  input: { ...taskUpdate.input, tool_use_id: 'toolu_delete_2', taskId: '2', status: 'deleted' },
  result: { ...taskUpdate.result, result: { success: true, taskId: '2', updatedFields: ['deleted'] } },
} as const
const createFailed = {
  input: { ...taskCreate.input, tool_use_id: 'toolu_create_failed' },
  result: { ref: 0, isError: true, text: 'Task list is full.', result: 'Error: Task list is full.' },
} as const

const engine = (on: On) => {
  const results: Record<string, unknown> = {
    [taskCreate.input.tool_use_id]: taskCreate.result,
    [createSecond.input.tool_use_id]: createSecond.result,
    [taskUpdate.input.tool_use_id]: taskUpdate.result,
    [complete.input.tool_use_id]: complete.result,
    [deleteSecond.input.tool_use_id]: deleteSecond.result,
    [createFailed.input.tool_use_id]: createFailed.result,
  }
  on('command.register', () => ({ value: { command: 'monitor' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.run', () => typedCommand.commandResult)
  on('tool.call', (_, e) => (results[e.tool_use_id ?? ''] ?? { ref: 0, text: '', result: {} }) as typeof taskCreate.result)
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'no-surface: no surface is attached' } }))
}

const texts = async (ui: { findAll: (q: { type: string }) => Promise<readonly { text?: string }[]> }) =>
  (await ui.findAll({ type: 'Text' })).map(one => one.text)

describe('session tasks', () => {
  test('a created task is pending; an update changes its status; a deleted one is dropped', () => {
    const one = taskCreated([], taskCreate.result)
    expect(one).toEqual([{ id: '1', subject: 'Task 1: Live event check for the monitor mod', status: 'pending' }])

    const two = taskCreated(one, createSecond.result)
    const started = taskUpdated(two, taskUpdate.input, taskUpdate.result)
    expect(started.map(task => task.status)).toEqual(['in_progress', 'pending'])

    expect(taskUpdated(started, deleteSecond.input, deleteSecond.result).map(task => task.id)).toEqual(['1'])
  })

  test('a failed call changes nothing', () => {
    expect(taskCreated([], createFailed.result)).toEqual([])
    const one = taskCreated([], taskCreate.result)
    expect(taskUpdated(one, complete.input, createFailed.result)).toEqual(one)
  })

  test('TodoWrite replaces the whole list', () => {
    const todos = [
      { content: 'Write the test', status: 'completed', activeForm: 'Writing the test' },
      { content: 'Make it pass', status: 'in_progress', activeForm: 'Making it pass' },
      { content: 'Commit', status: 'pending', activeForm: 'Committing' },
    ] as const
    expect(taskCounts(todosWritten(todos))).toEqual({ done: 1, total: 3 })
  })

  test("the totals count the session's tasks, and leave them out when there are none", () => {
    const base = { activity: [], artifacts: NO_ARTIFACTS, files: [], commits: [], checks: [], now: 0 }
    const tasks = taskUpdated(taskCreated(taskCreated([], taskCreate.result), createSecond.result), complete.input, complete.result)
    const totals = (list: typeof tasks) => sectionsOf({ ...base, tasks: list }).find(section => section.key === 'totals')?.lines[0]?.text

    expect(totals(tasks)).toBe('no files changed · no commits · no checks · 1/2 tasks')
    expect(totals([])).toBe('no files changed · no commits · no checks')
  })
})

test('task tool calls update the session task count in the totals', async ($, on) => {
  mock.clock(on)
  engine(on)
  await $.session.start(sessionStart)
  await $.tool.call(taskCreate.input)
  await $.tool.call(createSecond.input)
  await $.tool.call(taskUpdate.input)
  await $.tool.call(complete.input)
  await $.tool.call(createFailed.input)

  const ui = await $.ui.mount(PANE)
  expect(await texts(ui)).toContain('no files changed · no commits · no checks · 1/2 tasks')
  await $.tool.call(deleteSecond.input)
  expect(await texts(ui)).toContain('no files changed · no commits · no checks · 1/1 tasks')
  await ui.unmount()
})

test('a TodoWrite call sets the session count', async ($, on) => {
  mock.clock(on)
  engine(on)
  await $.session.start(sessionStart)
  await $.tool.call({
    tool: 'TodoWrite',
    tool_use_id: 'toolu_todo',
    todos: [
      { content: 'Write the test', status: 'completed', activeForm: 'Writing the test' },
      { content: 'Make it pass', status: 'pending', activeForm: 'Making it pass' },
    ],
  })

  const ui = await $.ui.mount(PANE)
  expect(await texts(ui)).toContain('no files changed · no commits · no checks · 1/2 tasks')
  await ui.unmount()
})

test("/monitor's text summary shows the same task count", async ($, on) => {
  mock.clock(on)
  engine(on)
  await $.session.start(sessionStart)
  await $.tool.call(taskCreate.input)

  const out = await $.command.run({ ...typedCommand.commandRun, command: 'monitor', args: '' })
  expect(out.text).toContain('\nno files changed · no commits · no checks · 0/1 tasks')
})

test('task tool calls pass through unchanged', async ($, on) => {
  mock.clock(on)
  engine(on)
  await $.session.start(sessionStart)

  expect(await $.tool.call(taskCreate.input)).toEqual(taskCreate.result)
  expect(await $.tool.call(complete.input)).toEqual(complete.result)
})
