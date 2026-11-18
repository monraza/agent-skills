import { atom, read } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { sectionsOf } from './sections'
import type { SessionData } from './sections'
import { summaryOf } from './summary'
import { drawPane } from './view'

const PANE = { id: 'monitor', title: 'Workflow' } as const

// Change the shape tag when an entry's fields change: it declines what an
// earlier version stored, which outlives a reload.
const activity = atom({ plugin: 'monitor', key: 'activity' } as const, [], {
  shape: 'activity-1',
})

const sessionData = async ($: EngineInterface): Promise<SessionData> => ({
  activity: await read($, activity),
})

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'monitor',
      description: 'Show the agent-skills workflow panel for this session',
    })

    return next(e)
  })

  // Where no screen shows panes (the Android app attaches none to a cloud
  // session), the reply carries the panel as text instead.
  on('command.run', { command: 'monitor' }, async $ => {
    const opened = await $.ui.open(PANE)
    if (opened.isPlaced) return { text: 'Workflow panel opened.' }

    return { text: summaryOf(sectionsOf(await sessionData($))) }
  })

  on('ui.render', { component: 'Pane', requestId: 'monitor' }, async ($, e) =>
    drawPane($.ui.resolve(e), sectionsOf(await sessionData($))),
  )
}
