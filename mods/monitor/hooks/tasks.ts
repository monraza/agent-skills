import type { SessionTask, TaskStatus, TodoCount } from '../types'

import { isRecord } from './classify'

// Pure: no `$`, no I/O. The session's own task list, from the task tools'
// calls: TaskCreate's result carries the new id at `result.task.id` and
// TaskUpdate's input names the task (the live recording); TodoWrite sends the
// whole list each time.

const failed = (ran: unknown) => !isRecord(ran) || ran.isError === true

export const taskCreated = (tasks: readonly SessionTask[], ran: unknown): SessionTask[] => {
  if (failed(ran) || !isRecord(ran) || !isRecord(ran.result) || !isRecord(ran.result.task)) return [...tasks]
  const { id, subject } = ran.result.task
  if (typeof id !== 'string') return [...tasks]

  return [
    ...tasks.filter(task => task.id !== id),
    { id, subject: typeof subject === 'string' ? subject : '', status: 'pending' },
  ]
}

export type TaskChange = { taskId: string; status?: TaskStatus | 'deleted'; subject?: string }

export const taskUpdated = (tasks: readonly SessionTask[], change: TaskChange, ran: unknown): SessionTask[] => {
  if (failed(ran)) return [...tasks]
  if (change.status === 'deleted') return tasks.filter(task => task.id !== change.taskId)
  const { status } = change

  return tasks.map(task =>
    task.id === change.taskId
      ? { ...task, status: status ?? task.status, subject: change.subject ?? task.subject }
      : task,
  )
}

export const todosWritten = (todos: readonly { content: string; status: TaskStatus }[]): SessionTask[] =>
  todos.map((todo, index) => ({ id: `todo-${index + 1}`, subject: todo.content, status: todo.status }))

export const taskCounts = (tasks: readonly SessionTask[]): TodoCount => ({
  done: tasks.filter(task => task.status === 'completed').length,
  total: tasks.length,
})
