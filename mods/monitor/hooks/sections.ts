import type { ActivityEntry, Artifacts, Check, Commit, FileChange, PhaseId, SessionTask } from '../types'

import { doneFrom } from './artifacts'
import { PHASES, PHASE_LABEL, bareName, phaseOfCommand, phaseOfSkill, phaseViewOf } from './phases'
import { taskCounts } from './tasks'

// Pure: no `$`, no I/O. The one place that decides what the panel shows, so
// the pane (view.tsx) and /monitor's text (summary.ts) never disagree.
// Four blocks (SPEC.md, Pane layout): where you are on the stepper, the
// current step, what happened recently, and the session's totals.

// How a line reads: the current step, done (✓), failed (✗), plain or dim.
export type Tone = 'current' | 'done' | 'failed' | 'normal' | 'muted'

// `time` is a Recent row's relative time, drawn apart from its text.
export type Line = { text: string; tone: Tone; time?: string }

export type Section = { key: string; title: string | null; lines: readonly Line[] }

export type SessionData = {
  activity: readonly ActivityEntry[]
  artifacts: Artifacts
  files: readonly FileChange[]
  commits: readonly Commit[]
  checks: readonly Check[]
  tasks: readonly SessionTask[]
  now: number
}

const MINUTE = 60_000
const RECENT_EVENTS = 4

const SYMBOL = { current: '●', done: '✓', todo: '○' } as const

export const ago = (at: number, now: number): string => {
  const minutes = Math.floor((now - at) / MINUTE)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`

  return `${Math.floor(minutes / 60)} h ago`
}

const labelOf = ({ kind, name }: ActivityEntry): string =>
  kind === 'command' ? `/${bareName(name)}` : `skill ${bareName(name)}`

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

// ● the current step, ✓ a step that's done or the session has been through,
// ○ a step not reached yet.
const stepperSection = ({ activity, artifacts }: SessionData): Section => {
  const { states } = phaseViewOf(activity)
  const done = doneFrom(artifacts)
  const stateOf = (phase: PhaseId) =>
    states[phase] === 'active' ? 'current' : done[phase] || states[phase] === 'visited' ? 'done' : 'todo'
  const progress = (phase: PhaseId) =>
    phase === 'build' && artifacts.todo !== null ? ` ${artifacts.todo.done}/${artifacts.todo.total}` : ''
  const lines = PHASES.map((phase): Line => {
    const state = stateOf(phase)

    return { text: `${SYMBOL[state]} ${PHASE_LABEL[phase]}${progress(phase)}`, tone: state === 'todo' ? 'muted' : state }
  })

  return { key: 'stepper', title: null, lines }
}

const currentSection = ({ activity, artifacts, now }: SessionData): Section => {
  const { active } = phaseViewOf(activity)
  if (active === null) {
    return {
      key: 'current',
      title: null,
      lines: [
        { text: 'No step yet', tone: 'current' },
        { text: 'waiting for an agent-skills command or skill', tone: 'muted' },
      ],
    }
  }
  const step = PHASES.indexOf(active.phase) + 1
  const lines: Line[] = [
    { text: `${PHASE_LABEL[active.phase].toUpperCase()} · step ${step} of ${PHASES.length}`, tone: 'current' },
    { text: `started by ${labelOf(active)} · ${ago(active.at, now)}`, tone: 'muted' },
  ]
  if (active.phase === 'build' && artifacts.todo !== null) {
    lines.push({ text: `${artifacts.todo.done} of ${artifacts.todo.total} tasks checked in tasks/todo.md`, tone: 'normal' })
  }

  return { key: 'current', title: null, lines }
}

// Commands and skills outside the phase table (/model, /monitor, other
// plugins' skills) are recorded but never shown.
const isWorkflow = ({ kind, name }: ActivityEntry) =>
  (kind === 'command' ? phaseOfCommand(name) : phaseOfSkill(name)) !== undefined

type Event = { at: number; text: string; tone: Tone }

// The newest workflow events across every list, newest first. Each list is
// taken newest first, so events at the same moment keep their own order.
const recentSection = ({ activity, files, commits, checks, now }: SessionData): Section | null => {
  const newestFirst = <T>(list: readonly T[]) => [...list].reverse()
  const events: Event[] = [
    ...newestFirst(activity.filter(isWorkflow)).map(entry => ({ at: entry.at, text: labelOf(entry), tone: 'normal' as const })),
    ...newestFirst(files).map(({ path, at }) => ({ at, text: `edited ${path}`, tone: 'normal' as const })),
    ...newestFirst(commits).map(({ sha, subject, at }) => ({ at, text: `committed ${sha} ${subject}`.trim(), tone: 'normal' as const })),
    ...newestFirst(checks).map(({ label, ok, at }) => ({ at, text: `${ok ? '✓' : '✗'} ${label}`, tone: ok ? ('done' as const) : ('failed' as const) })),
  ]
  if (events.length === 0) return null
  const lines = events
    .sort((a, b) => b.at - a.at)
    .slice(0, RECENT_EVENTS)
    .map(({ at, text, tone }) => ({ text, tone, time: ago(at, now) }))

  return { key: 'recent', title: 'Recent', lines }
}

const totalsSection = ({ files, commits, checks, tasks }: SessionData): Section => {
  const failed = checks.filter(check => !check.ok).length
  const session = taskCounts(tasks)
  const parts = [
    files.length === 0 ? 'no files changed' : `${count(files.length, 'file', 'files')} changed`,
    commits.length === 0 ? 'no commits' : count(commits.length, 'commit', 'commits'),
    checks.length === 0 ? 'no checks' : `${count(checks.length, 'check', 'checks')}${failed > 0 ? `, ${failed} failed` : ''}`,
    ...(tasks.length === 0 ? [] : [`${session.done}/${session.total} tasks`]),
  ]

  return { key: 'totals', title: null, lines: [{ text: parts.join(' · '), tone: 'muted' }] }
}

export const sectionsOf = (data: SessionData): Section[] =>
  [stepperSection(data), currentSection(data), recentSection(data), totalsSection(data)].filter(
    (section): section is Section => section !== null,
  )
