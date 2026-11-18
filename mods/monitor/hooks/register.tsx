import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Artifacts, PhaseId } from '../types'

import { NO_ARTIFACTS, PLAN_PATH, TODO_PATH, countTodo, hasSpecIn, isTrackedPath, relativeTo, todoTasksOf } from './artifacts'
import { checkOf, commitOf, isCreated, keepNewest } from './classify'
import {
  NEW_TURN,
  afterCommand,
  afterTurnStart,
  commandEntry,
  isOwnExpansion,
  PHASES,
  PHASE_LABEL,
  phaseNamed,
  phaseOfCommand,
  phaseOfSkill,
  phaseViewOf,
  skillEntry,
} from './phases'
import { sectionsOf } from './sections'
import type { SessionData } from './sections'
import { summaryOf } from './summary'
import { taskCreated, taskUpdated, todosWritten } from './tasks'
import { drawPane } from './view'

const PANE = { id: 'monitor', title: 'Workflow' } as const
const MINUTE = 60_000


// Change a shape tag when its value's fields change: it declines what an
// earlier version stored, which outlives a reload.
const activity = atom({ plugin: 'monitor', key: 'activity' } as const, [], { shape: 'activity-1' })
const artifacts = atom({ plugin: 'monitor', key: 'artifacts' } as const, NO_ARTIFACTS, { shape: 'artifacts-2' })
const files = atom({ plugin: 'monitor', key: 'files' } as const, [], { shape: 'files-3' })
const commits = atom({ plugin: 'monitor', key: 'commits' } as const, [], { shape: 'commits-2' })
const checks = atom({ plugin: 'monitor', key: 'checks' } as const, [], { shape: 'checks-1' })
const tasks = atom({ plugin: 'monitor', key: 'tasks' } as const, [], { shape: 'tasks-1' })
const turn = atom({ plugin: 'monitor', key: 'turn' } as const, NEW_TURN, { shape: 'turn-1' })
const tick = atom({ plugin: 'monitor', key: 'tick' } as const, 0)
const hasOpened = atom({ plugin: 'monitor', key: 'hasOpened' } as const, false)
const viewing = atom({ plugin: 'monitor', key: 'viewing' } as const, null)

const sessionData = async ($: EngineInterface): Promise<SessionData> => ({
  activity: await read($, activity),
  artifacts: await read($, artifacts),
  files: await read($, files),
  commits: await read($, commits),
  checks: await read($, checks),
  tasks: await read($, tasks),
  now: await $.clock.now(),
})

// File names in a folder; none when it is missing.
const filesIn = async ($: EngineInterface, folder: string): Promise<string[]> =>
  (await $.fs.exists(folder))
    ? (await $.fs.list(folder)).filter(entry => entry.kind === 'file').map(entry => entry.name)
    : []

// Paths are built from the session's working directory, the same one tool
// calls' paths are compared with (the engine would otherwise resolve a
// relative path against a base of its own choosing).
const readArtifacts = async ($: EngineInterface): Promise<Artifacts> => {
  const cwd = (await $.session.cwd()).replace(/\/$/, '')
  const at = (path: string) => `${cwd}/${path}`

  const todo = (await $.fs.exists(at(TODO_PATH))) ? await $.fs.read(at(TODO_PATH)) : null

  return {
    hasSpec: hasSpecIn({
      root: await filesIn($, cwd),
      docs: await filesIn($, at('docs')),
      spec: await filesIn($, at('spec')),
    }),
    hasPlan: await $.fs.exists(at(PLAN_PATH)),
    todo: todo === null ? null : countTodo(todo),
    todoTasks: todo === null ? [] : todoTasksOf(todo),
  }
}

// A failed read keeps what the panel showed: it never affects the session.
const refreshArtifacts = async ($: EngineInterface) => {
  try {
    const found = await readArtifacts($)
    await update($, artifacts, () => found)
  } catch {
    // keep the previous value
  }
}

const hasTasksFolder = async ($: EngineInterface): Promise<boolean> => {
  try {
    return await $.fs.exists(`${(await $.session.cwd()).replace(/\/$/, '')}/tasks`)
  } catch {
    return false
  }
}

// The pane opens on its own at most once per session (SPEC.md, Opening
// rules); after that only /monitor opens it. Not awaited, and a failure is
// ignored: opening must never hold up or break what triggered it.
const openOnce = async ($: EngineInterface) => {
  if (await read($, hasOpened)) return
  await update($, hasOpened, () => true)
  void $.ui.open(PANE).catch(() => undefined)
}

// Every observing hook records, then passes the event on unchanged.
export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'monitor',
      description: 'Show the agent-skills workflow panel for this session',
    })
    $.clock.every(MINUTE, () => void update($, tick, count => count + 1))
    const ran = await next(e)
    await refreshArtifacts($)
    if ((await read($, artifacts)).hasSpec || (await hasTasksFolder($))) await openOnce($)

    return ran
  })

  on('command.run', async ($, e, next) => {
    const at = await $.clock.now()
    await update($, activity, list => keepNewest([...list, commandEntry(e.command, at)]))
    await update($, turn, current => afterCommand(current, e.command))
    if (phaseOfCommand(e.command) !== undefined) await openOnce($)

    return next(e)
  })

  // Where no screen shows panes (the Android app attaches none to a cloud
  // session), the reply carries the panel as text instead.
  // `/monitor <step>` looks back at that step; `/monitor` alone shows the
  // current one.
  on('command.run', { command: 'monitor' }, async ($, e) => {
    const step = phaseNamed(e.args)
    if (e.args.trim() !== '' && step === null) {
      return { text: `Unknown step "${e.args.trim()}". Use one of: ${PHASES.join(', ')}.` }
    }
    await update($, hasOpened, () => true)
    await update($, viewing, () => step)
    const opened = await $.ui.open(PANE)
    if (opened.isPlaced) {
      return { text: step === null ? 'Workflow panel opened.' : `Workflow panel opened, looking back at ${PHASE_LABEL[step]}.` }
    }

    return { text: summaryOf(sectionsOf(await sessionData($), step)) }
  })

  on('turn.start', async ($, e, next) => {
    await update($, turn, afterTurnStart)
    const ran = await next(e)
    await refreshArtifacts($)

    return ran
  })

  on('skill.prompt', async ($, e, next) => {
    const current = await read($, turn)
    if (!isOwnExpansion(current, e.skill)) {
      const at = await $.clock.now()
      await update($, activity, list => keepNewest([...list, skillEntry(e.skill, at, current)]))
      if (phaseOfSkill(e.skill) !== undefined) await openOnce($)
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const edited =
      e.tool === 'Edit' || e.tool === 'Write' ? e.file_path : e.tool === 'NotebookEdit' ? e.notebook_path : null
    // A failed edit changed nothing.
    if (edited !== null && ran.isError !== true) {
      try {
        const path = relativeTo(await $.session.cwd(), edited)
        const at = await $.clock.now()
        const created = e.tool === 'Write' && isCreated(ran)
        await update($, files, list => keepNewest([...list, { path, at, created }]))
        if (isTrackedPath(path)) await refreshArtifacts($)
      } catch {
        // no working directory to compare with: nothing recorded
      }
    }
    if (e.tool === 'Bash') {
      const commit = commitOf(ran, await $.clock.now())
      if (commit !== null) await update($, commits, list => keepNewest([...list, commit]))
      const check = checkOf(e.command, ran, await $.clock.now())
      if (check !== null) await update($, checks, list => keepNewest([...list, check]))
    }
    if (e.tool === 'TaskCreate') await update($, tasks, list => taskCreated(list, ran))
    if (e.tool === 'TaskUpdate') await update($, tasks, list => taskUpdated(list, e, ran))
    if (e.tool === 'TodoWrite' && ran.isError !== true) await update($, tasks, () => todosWritten(e.todos))

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: 'monitor' }, async ($, e) => {
    await read($, tick) // subscribes the drawing, so relative times move on
    const layout = { columns: e.props.bodyColumns, surface: e.surface }
    const data = await sessionData($)
    const current = phaseViewOf(data.activity).active?.phase ?? null
    // Pressing the current step, or the one being viewed, returns to the
    // current step; any other step opens its look-back view.
    const actions = {
      onStep: (phase: PhaseId) => void update($, viewing, shown => (phase === shown || phase === current ? null : phase)),
      onBack: () => void update($, viewing, () => null),
    }

    return drawPane($.ui.resolve(e), sectionsOf(data, await read($, viewing)), layout, actions)
  })
}
