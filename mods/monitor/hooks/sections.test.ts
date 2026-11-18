import { expect, test } from 'claude-code/testing'

import { sectionsOf } from './sections'
import { summaryOf } from './summary'

test('an empty session has a phase section and an activity section, both empty', () => {
  expect(sectionsOf({ activity: [] })).toEqual([
    { key: 'phase', title: null, lines: [{ text: 'No phase yet', isDim: true }] },
    { key: 'activity', title: null, lines: [{ text: 'No activity yet.', isDim: true }] },
  ])
})

test('the text summary of an empty session', () => {
  expect(summaryOf(sectionsOf({ activity: [] }))).toBe(
    [
      'No screen here shows panes, so here is the Workflow panel as text.',
      '',
      'Workflow',
      'No phase yet',
      'No activity yet.',
    ].join('\n'),
  )
})

test('a titled section is one line in the summary, its items joined', () => {
  const sections = [
    { key: 'files', title: 'Files (2)', lines: [{ text: 'SPEC.md', isDim: false }, { text: 'a.ts', isDim: false }] },
  ] as const

  expect(summaryOf(sections).split('\n').at(-1)).toBe('Files (2): SPEC.md; a.ts')
})
