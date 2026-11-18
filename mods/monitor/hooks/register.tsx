import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Artifacts } from '../types'

import { NO_ARTIFACTS, PLAN_PATH, TODO_PATH, countTodo, hasSpecIn, isTrackedPath, relativeTo } from './artifacts'
import { NEW_TURN, afterCommand, afterTurnStart, commandEntry, isOwnExpansion, skillEntry } from './phases'
import { sectionsOf } from './sections'
import type { SessionData } from './sections'
import { summaryOf } from './summary'
import { drawPane } from './view'

const PANE = { id: 'monitor', title: 'Workflow' } as const
const MINUTE = 60_000

// Change a shape tag when its value's fields change: it declines what an
// earlier version stored, which outlives a reload.
const activity = atom({ plugin: 'monitor', key: 'activity' } as const, [], { shape: 'activity-1' })
const artifacts = atom({ plugin: 'monitor', key: 'artifacts' } as const, NO_ARTIFACTS, { shape: 'artifacts-1' })
const turn = atom({ plugin: 'monitor', key: 'turn' } as const, NEW_TURN, { shape: 'turn-1' })
const tick = atom({ plugin: 'monitor', key: 'tick' } as const, 0)

const sessionData = async ($: EngineInterface): Promise<SessionData> => ({
  activity: await read($, activity),
  artifacts: await read($, artifacts),
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

  return {
    hasSpec: hasSpecIn({
      root: await filesIn($, cwd),
      docs: await filesIn($, at('docs')),
      spec: await filesIn($, at('spec')),
    }),
    hasPlan: await $.fs.exists(at(PLAN_PATH)),
    todo: (await $.fs.exists(at(TODO_PATH))) ? countTodo(await $.fs.read(at(TODO_PATH))) : null,
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

    return ran
  })

  on('command.run', async ($, e, next) => {
    const at = await $.clock.now()
    await update($, activity, list => [...list, commandEntry(e.command, at)])
    await update($, turn, current => afterCommand(current, e.command))

    return next(e)
  })

  // Where no screen shows panes (the Android app attaches none to a cloud
  // session), the reply carries the panel as text instead.
  on('command.run', { command: 'monitor' }, async $ => {
    const opened = await $.ui.open(PANE)
    if (opened.isPlaced) return { text: 'Workflow panel opened.' }

    return { text: summaryOf(sectionsOf(await sessionData($))) }
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
      await update($, activity, list => [...list, skillEntry(e.skill, at, current)])
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const edited =
      e.tool === 'Edit' || e.tool === 'Write' ? e.file_path : e.tool === 'NotebookEdit' ? e.notebook_path : null
    if (edited !== null) {
      try {
        if (isTrackedPath(relativeTo(await $.session.cwd(), edited))) await refreshArtifacts($)
      } catch {
        // no working directory to compare with: nothing to refresh
      }
    }

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: 'monitor' }, async ($, e) => {
    await read($, tick) // subscribes the drawing, so relative times move on
    return drawPane($.ui.resolve(e), sectionsOf(await sessionData($)))
  })
}
