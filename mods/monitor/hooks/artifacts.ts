import type { Artifacts, PhaseId, TodoCount } from '../types'

// Pure: no `$`, no I/O. What the spec, plan and todo files mean for the
// phases (SPEC.md, Phase rules). register.tsx reads the files.

export const NO_ARTIFACTS: Artifacts = { hasSpec: false, hasPlan: false, todo: null }

export const PLAN_PATH = 'tasks/plan.md'
export const TODO_PATH = 'tasks/todo.md'

const TODO_ITEM = /^\s*[-*+]\s+\[([ xX])\]\s/

export const countTodo = (text: string): TodoCount => {
  const marks = text.split('\n').flatMap(line => line.match(TODO_ITEM)?.[1] ?? [])

  return { done: marks.filter(mark => mark !== ' ').length, total: marks.length }
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
