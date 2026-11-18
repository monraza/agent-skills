import type { Artifacts, PhaseId, TodoCount, TodoTask } from '../types'

// Pure: no `$`, no I/O. What the spec, plan and todo files mean for the
// phases (SPEC.md, Phase rules). register.tsx reads the files.

export const NO_ARTIFACTS: Artifacts = { hasSpec: false, hasPlan: false, todo: null, todoTasks: [] }

export const PLAN_PATH = 'tasks/plan.md'
export const TODO_PATH = 'tasks/todo.md'

const TODO_ITEM = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/

// The todo's tasks: its checkbox items whose text starts with `Task`, or
// every checkbox item when none does. A title loses its ** and is cut at
// ' · ', where this repo's task lines start their size and dependencies.
export const todoTasksOf = (text: string): TodoTask[] => {
  const items = text.split('\n').flatMap(line => {
    const match = line.match(TODO_ITEM)
    if (match === null) return []
    const title = (match[2] ?? '').replaceAll('**', '').split(' · ')[0]?.trim() ?? ''

    return [{ title, done: match[1] !== ' ' }]
  })
  const tasks = items.filter(item => /^task\b/i.test(item.title))

  return tasks.length > 0 ? tasks : items
}

export const countTodo = (text: string): TodoCount => {
  const tasks = todoTasksOf(text)

  return { done: tasks.filter(task => task.done).length, total: tasks.length }
}

const ROOT_SPEC = /^SPEC(-[^/]+)?\.md$/

// The paths /build accepts: SPEC.md, a root SPEC-<change>.md, docs/SPEC.md,
// or a file under spec/. Each list holds the file names in that folder.
export const hasSpecIn = (files: { root: readonly string[]; docs: readonly string[]; spec: readonly string[] }) =>
  files.root.some(name => ROOT_SPEC.test(name)) || files.docs.includes('SPEC.md') || files.spec.length > 0

// A path relative to the working directory, as relativeTo gives it.
export const isTrackedPath = (path: string): boolean =>
  ROOT_SPEC.test(path) ||
  path === 'docs/SPEC.md' ||
  /^spec\/[^/]+$/.test(path) ||
  path === PLAN_PATH ||
  path === TODO_PATH

export const relativeTo = (cwd: string, path: string): string => {
  const root = cwd.endsWith('/') ? cwd : `${cwd}/`

  return path.startsWith(root) ? path.slice(root.length) : path
}

export const doneFrom = ({ hasSpec, hasPlan, todo }: Artifacts): Record<PhaseId, boolean> => ({
  define: hasSpec,
  plan: hasPlan,
  build: todo !== null && todo.total > 0 && todo.done === todo.total,
  verify: false,
  review: false,
  ship: false,
})
