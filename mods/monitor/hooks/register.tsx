import { atom, read } from 'claude-code'
import type { Register } from 'claude-code'

import { drawPane } from './view'

const PANE = { id: 'monitor', title: 'Workflow' } as const

// Change the shape tag when an entry's fields change: it declines what an
// earlier version stored, which outlives a reload.
const activity = atom({ plugin: 'monitor', key: 'activity' } as const, [], {
  shape: 'activity-1',
})

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'monitor',
      description: 'Show the agent-skills workflow panel for this session',
    })

    return next(e)
  })

  on('command.run', { command: 'monitor' }, async $ => {
    await $.ui.open(PANE)

    return { text: 'Workflow panel opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: 'monitor' }, async ($, e) =>
    drawPane($.ui.resolve(e), { activity: await read($, activity) }),
  )
}
