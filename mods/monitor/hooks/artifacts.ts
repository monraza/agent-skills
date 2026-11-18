import type { Artifacts, PhaseId, TodoCount, TodoTask } from '../types'

// Pure: no `$`, no I/O. What the spec, plan and todo files mean for the
// phases (SPEC.md, Phase rules). register.tsx reads the files.

export const NO_ARTIFACTS: Artifacts = { hasSpec: false, hasPlan: false, todo: null, todoTasks: [] }

export const PLAN_PATH = 'tasks/plan.md'
export const TODO_PATH = 'tasks/todo.md'

const TODO_ITEM = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/
const HEADING = /^(#{1,6})\s+(.*)$/
const TASK_NUMBER = /^task\s+(\d+[a-z]?)\b\s*[:.)\-–—]?\s*/i
const IS_TASK = /^task\b/i

type Item = { text: string; done: boolean }

const itemsOf = (lines: readonly string[]): Item[] =>
  lines.flatMap(line => {
    const match = line.match(TODO_ITEM)

    return match === null ? [] : [{ text: match[2] ?? '', done: match[1] !== ' ' }]
  })

// A title loses its ** and is cut at ' · ', where this repo's task lines
// start their size and dependencies; `Task N:` becomes its number.
const taskOf = (text: string, place: number, done: boolean, started: boolean): TodoTask => {
  const plain = text.replaceAll('**', '').split(' · ')[0]?.trim() ?? ''
  const match = plain.match(TASK_NUMBER)
  if (match === null) return { number: String(place), title: plain, done, started }

  // `Task 3` with nothing after its number keeps its whole text as the title.
  const title = plain.slice(match[0].length).trim()

  return { number: match[1] ?? String(place), title: title === '' ? plain : title, done, started }
}

// The planning skill's `## Task N: title` sections: the boxes under a task
// heading, down to the next heading as high as it, are that task's. A
// heading needs its number (`## Task List` is not a task).
const headingTasksOf = (lines: readonly string[]): TodoTask[] => {
  const sections: { text: string; boxes: Item[] }[] = []
  let level = 0
  for (const line of lines) {
    const heading = line.match(HEADING)
    const depth = heading?.[1]?.length ?? 0
    const text = heading?.[2]?.trim() ?? ''
    if (heading !== null && TASK_NUMBER.test(text.replaceAll('**', ''))) {
      sections.push({ text, boxes: [] })
      level = depth
    } else if (heading !== null && depth <= level) {
      level = 0
    } else if (level > 0) {
      sections.at(-1)?.boxes.push(...itemsOf([line]))
    }
  }

  return sections.map(({ text, boxes }, index) => {
    const checked = boxes.filter(box => box.done).length

    return taskOf(text, index + 1, boxes.length > 0 && checked === boxes.length, checked > 0)
  })
}

// The todo's tasks, in this order of preference: its checkbox items whose
// text starts with `Task`; its `## Task N:` headings; every checkbox item.
export const todoTasksOf = (text: string): TodoTask[] => {
  const lines = text.split('\n')
  const items = itemsOf(lines)
  const taskItems = items.filter(item => IS_TASK.test(item.text.replaceAll('**', '')))
  if (taskItems.length > 0) return taskItems.map((item, index) => taskOf(item.text, index + 1, item.done, false))
  const headed = headingTasksOf(lines)
  if (headed.length > 0) return headed

  return items.map((item, index) => taskOf(item.text, index + 1, item.done, false))
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
