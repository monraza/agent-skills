import type { ActivityEntry, Artifacts, Commit, PhaseId } from '../types'

import { doneFrom } from './artifacts'
import { PHASES, PHASE_LABEL, bareName, phaseViewOf } from './phases'

// Pure: no `$`, no I/O. The one place that decides what the panel shows, so
// the pane (view.tsx) and /monitor's text (summary.ts) never disagree.

export type Line = { text: string; isDim: boolean }

// A section without a title is shown line by line; one with a title is a
// labelled list.
export type Section = { key: string; title: string | null; lines: readonly Line[] }

export type SessionData = {
  activity: readonly ActivityEntry[]
  artifacts: Artifacts
  files: readonly string[]
  commits: readonly Commit[]
  now: number
}

const MINUTE = 60_000

const SYMBOL = { todo: '○', active: '◉', visited: '·', done: '✓' } as const

const empty = (text: string): readonly Line[] => [{ text, isDim: true }]

export const ago = (at: number, now: number): string => {
  const minutes = Math.floor((now - at) / MINUTE)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`

  return `${Math.floor(minutes / 60)} h ago`
}

const labelOf = ({ kind, name }: ActivityEntry): string =>
  kind === 'command' ? `/${bareName(name)}` : `skill ${bareName(name)}`

const phaseSection = ({ activity, artifacts, now }: SessionData): Section => {
  const { active, states } = phaseViewOf(activity)
  const done = doneFrom(artifacts)
  // The active phase wins over a done mark: it is what the session is doing.
  const shown = (phase: PhaseId) => (states[phase] === 'active' ? 'active' : done[phase] ? 'done' : states[phase])
  const progress = (phase: PhaseId) =>
    phase === 'build' && artifacts.todo !== null ? ` ${artifacts.todo.done}/${artifacts.todo.total}` : ''
  const phases = PHASES.map(phase => ({
    text: `${SYMBOL[shown(phase)]} ${PHASE_LABEL[phase]}${progress(phase)}`,
    isDim: shown(phase) === 'todo' || shown(phase) === 'visited',
  }))
  const evidence =
    active === null
      ? { text: 'No phase yet', isDim: true }
      : { text: `${PHASE_LABEL[active.phase]} · since ${labelOf(active)}, ${ago(active.at, now)}`, isDim: false }

  return { key: 'phase', title: null, lines: [...phases, evidence] }
}

const activitySection = ({ activity, now }: SessionData): Section => {
  if (activity.length === 0) return { key: 'activity', title: null, lines: empty('No activity yet.') }
  const lines = [...activity].reverse().map(entry => ({
    text: [labelOf(entry), entry.phase === null ? null : PHASE_LABEL[entry.phase], ago(entry.at, now)]
      .filter(part => part !== null)
      .join(' · '),
    isDim: false,
  }))

  return { key: 'activity', title: 'Activity', lines }
}

const filesSection = ({ files }: SessionData): Section =>
  files.length === 0
    ? { key: 'files', title: null, lines: empty('No files changed yet.') }
    : { key: 'files', title: `Files (${files.length})`, lines: [...files].reverse().map(text => ({ text, isDim: false })) }

const commitsSection = ({ commits }: SessionData): Section =>
  commits.length === 0
    ? { key: 'commits', title: null, lines: empty('No commits yet.') }
    : {
        key: 'commits',
        title: 'Commits',
        lines: [...commits].reverse().map(({ sha, subject }) => ({ text: `${sha} ${subject}`.trim(), isDim: false })),
      }

export const sectionsOf = (data: SessionData): Section[] => [
  phaseSection(data),
  activitySection(data),
  filesSection(data),
  commitsSection(data),
]
