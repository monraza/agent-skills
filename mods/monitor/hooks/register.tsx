import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

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
const turn = atom({ plugin: 'monitor', key: 'turn' } as const, NEW_TURN, { shape: 'turn-1' })
const tick = atom({ plugin: 'monitor', key: 'tick' } as const, 0)

const sessionData = async ($: EngineInterface): Promise<SessionData> => ({
  activity: await read($, activity),
  now: await $.clock.now(),
})

// Every observing hook records, then passes the event on unchanged.
export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'monitor',
      description: 'Show the agent-skills workflow panel for this session',
    })
    $.clock.every(MINUTE, () => void update($, tick, count => count + 1))

    return next(e)
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

    return next(e)
  })

  on('skill.prompt', async ($, e, next) => {
    const current = await read($, turn)
    if (!isOwnExpansion(current, e.skill)) {
      const at = await $.clock.now()
      await update($, activity, list => [...list, skillEntry(e.skill, at, current)])
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: 'monitor' }, async ($, e) => {
    await read($, tick) // subscribes the drawing, so relative times move on
    return drawPane($.ui.resolve(e), sectionsOf(await sessionData($)))
  })
}
