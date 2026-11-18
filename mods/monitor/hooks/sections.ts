import type { ActivityEntry } from '../types'

// Pure: no `$`, no I/O. The one place that decides what the panel shows, so
// the pane (view.tsx) and /monitor's text (summary.ts) never disagree.

export type Line = { text: string; isDim: boolean }

// A section without a title is shown line by line; one with a title is a
// labelled list.
export type Section = { key: string; title: string | null; lines: readonly Line[] }

export type SessionData = { activity: readonly ActivityEntry[] }

const empty = (text: string): readonly Line[] => [{ text, isDim: true }]

export const sectionsOf = ({ activity }: SessionData): Section[] => [
  { key: 'phase', title: null, lines: empty('No phase yet') },
  { key: 'activity', title: null, lines: activity.length === 0 ? empty('No activity yet.') : [] },
]
