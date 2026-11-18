import { describe, expect, test } from 'claude-code/testing'

import { NO_ARTIFACTS } from './artifacts'
import { commandEntry } from './phases'
import { ago, sectionsOf } from './sections'
import { summaryOf } from './summary'

const MINUTE = 60_000

describe('sections', () => {
  test('an empty session lists the six phases, no phase yet, and no activity', () => {
    expect(sectionsOf({ activity: [], artifacts: NO_ARTIFACTS, now: 0 })).toEqual([
      {
        key: 'phase',
        title: null,
        lines: [
          { text: '○ Define', isDim: true },
          { text: '○ Plan', isDim: true },
          { text: '○ Build', isDim: true },
          { text: '○ Verify', isDim: true },
          { text: '○ Review', isDim: true },
          { text: '○ Ship', isDim: true },
          { text: 'No phase yet', isDim: true },
        ],
      },
      { key: 'activity', title: null, lines: [{ text: 'No activity yet.', isDim: true }] },
    ])
  })

  test('activity is newest first, with phase and age', () => {
    const activity = [commandEntry('spec', 0), commandEntry('compact', 2 * MINUTE)]
    const [, section] = sectionsOf({ activity, artifacts: NO_ARTIFACTS, now: 5 * MINUTE })

    expect(section).toEqual({
      key: 'activity',
      title: 'Activity',
      lines: [
        { text: '/compact · 3 min ago', isDim: false },
        { text: '/spec · Define · 5 min ago', isDim: false },
      ],
    })
  })
})

describe('relative times', () => {
  test('just now, then minutes, then hours', () => {
    expect(ago(0, 59_999)).toBe('just now')
    expect(ago(0, MINUTE)).toBe('1 min ago')
    expect(ago(0, 59 * MINUTE)).toBe('59 min ago')
    expect(ago(0, 60 * MINUTE)).toBe('1 h ago')
    expect(ago(0, 150 * MINUTE)).toBe('2 h ago')
  })

  test('a time slightly ahead of now reads as just now', () => {
    expect(ago(1000, 0)).toBe('just now')
  })
})

describe('summary', () => {
  test('a blank line follows the phase section; a titled section is one line, its items joined', () => {
    const sections = [
      { key: 'phase', title: null, lines: [{ text: 'No phase yet', isDim: true }] },
      { key: 'files', title: 'Files (2)', lines: [{ text: 'SPEC.md', isDim: false }, { text: 'a.ts', isDim: false }] },
    ] as const

    expect(summaryOf(sections).split('\n').slice(-3)).toEqual(['No phase yet', '', 'Files (2): SPEC.md; a.ts'])
  })
})
