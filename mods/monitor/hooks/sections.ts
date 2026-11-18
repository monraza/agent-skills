import type { ActivityEntry, Artifacts, Check, Commit, FileChange, PhaseId, SessionTask } from '../types'

import { doneFrom, numbered } from './artifacts'
import { PHASES, PHASE_LABEL, bareName, phaseAt, phaseViewOf } from './phases'

// Pure: no `$`, no I/O. The one place that decides what the panel shows, so
// the pane (view.tsx) and /monitor's text (summary.ts) never disagree.
// One view per step (SPEC.md, Pane layout): the stepper, the step's header,
// Build's tasks, and the files changed, commits and checks from while that
// step was current.

// How a line reads: the current step, done (✓), failed (✗), plain or dim.
export type Tone = 'current' | 'done' | 'failed' | 'normal' | 'muted'

// `time` is a row's relative time, drawn apart from its text. On the
// stepper, `phase` makes a step a button that shows it, and `selected` marks
// the step on show when it isn't the current one. On a header, `back` is the
// label of the button back to the current step.
export type Line = { text: string; tone: Tone; time?: string; phase?: PhaseId; selected?: boolean; back?: string }

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

const SYMBOL = { current: '●', done: '✓', todo: '○' } as const

export const ago = (at: number, now: number): string => {
  const minutes = Math.floor((now - at) / MINUTE)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`

  return `${Math.floor(minutes / 60)} h ago`
}

const labelOf = ({ kind, name }: ActivityEntry): string =>
  kind === 'command' ? `/${bareName(name)}` : `skill ${bareName(name)}`

const currentOf = (data: SessionData): PhaseId | null => phaseViewOf(data.activity).active?.phase ?? null

// ● the current step, ✓ a step that's done or the session has been through,
// ○ a step not reached yet. ● and ✓ are buttons; the step on show, when it
// isn't the current one, is selected.
const stepperSection = ({ activity, artifacts }: SessionData, shown: PhaseId | null): Section => {
  const { states, active } = phaseViewOf(activity)
  const done = doneFrom(artifacts)
  const stateOf = (phase: PhaseId) =>
    states[phase] === 'active' ? 'current' : done[phase] || states[phase] === 'visited' ? 'done' : 'todo'
  const progress = (phase: PhaseId) =>
    phase === 'build' && artifacts.todo !== null ? ` ${artifacts.todo.done}/${artifacts.todo.total}` : ''
  const lines = PHASES.map((phase): Line => {
    const state = stateOf(phase)
    const text = `${SYMBOL[state]} ${PHASE_LABEL[phase]}${progress(phase)}`
    if (state === 'todo') return { text, tone: 'muted' }
    const selected = phase === shown && phase !== (active?.phase ?? null)

    return { text, tone: state, phase, ...(selected ? { selected } : {}) }
  })

  return { key: 'stepper', title: null, lines }
}

const headerSection = (data: SessionData, shown: PhaseId | null): Section => {
  const current = currentOf(data)
  if (shown === null) {
    return {
      key: 'header',
      title: null,
      lines: [
        { text: 'No step yet', tone: 'current' },
        { text: 'waiting for an agent-skills command or skill', tone: 'muted' },
      ],
    }
  }
  const started = data.activity.filter(entry => entry.setsPhase && entry.phase === shown).at(-1)
  const since =
    started !== undefined
      ? `started by ${labelOf(started)} · ${ago(started.at, data.now)}`
      : doneFrom(data.artifacts)[shown]
        ? 'done before this session'
        : 'not started in this session'
  const name: Line =
    shown === current
      ? { text: PHASE_LABEL[shown].toUpperCase(), tone: 'current' }
      : { text: PHASE_LABEL[shown].toUpperCase(), tone: 'done', back: current === null ? 'Close' : `Back to ${PHASE_LABEL[current]}` }

  return { key: 'header', title: null, lines: [name, { text: since, tone: 'muted' }] }
}

// Build is the densest step, so when it's on show the panel lists its
// tasks: the todo's, or the session's own when there's no todo. ✓ done,
// ▸ the first open task (next up), ○ the rest.
const tasksSection = ({ artifacts, tasks }: SessionData, shown: PhaseId | null): Section | null => {
  if (shown !== 'build') return null
  const list =
    artifacts.todo !== null
      ? artifacts.todoTasks
      : tasks.map(task => ({ ...numbered(task.subject, task.id), done: task.status === 'completed' }))
  if (list.length === 0) return null
  const next = list.findIndex(task => !task.done)
  const lines = list.map(({ number, title, done }, index): Line =>
    done
      ? { text: `✓ ${number}. ${title}`, tone: 'done' }
      : index === next
        ? { text: `▸ ${number}. ${title}`, tone: 'current' }
        : { text: `○ ${number}. ${title}`, tone: 'muted' },
  )
  const doneCount = list.filter(task => task.done).length

  return { key: 'tasks', title: `Tasks · ${doneCount} of ${list.length} done`, lines }
}

// Each key once, as of its latest entry, newest first.
const latestPer = <T extends { at: number }>(list: readonly T[], keyOf: (item: T) => string): T[] => {
  const seen = new Set<string>()

  return [...list].reverse().filter(item => !seen.has(keyOf(item)) && seen.add(keyOf(item)) !== undefined)
}

// What changed while the step on show was current: each event belongs to
// the step current at its moment (phaseAt); before any step, to none.
const changeSections = (data: SessionData, shown: PhaseId | null): Section[] => {
  const { activity, files, commits, checks, now } = data
  const inStep = (at: number) => phaseAt(activity, at) === shown
  const stepFiles = files.filter(file => inStep(file.at))
  const fileLines = latestPer(stepFiles, file => file.path).map(({ path, at }): Line => ({
    text: `${stepFiles.some(file => file.path === path && file.created) ? 'created' : 'edited'} ${path}`,
    tone: 'normal',
    time: ago(at, now),
  }))
  const commitLines = [...commits]
    .reverse()
    .filter(commit => inStep(commit.at))
    .map(({ sha, subject, at }): Line => ({ text: `${sha} ${subject}`.trim(), tone: 'normal', time: ago(at, now) }))
  const latestChecks = latestPer(checks.filter(check => inStep(check.at)), check => check.label)
  const checkLines = latestChecks.map(({ label, ok, at }): Line => ({
    text: `${ok ? '✓' : '✗'} ${label}`,
    tone: ok ? 'done' : 'failed',
    time: ago(at, now),
  }))
  const failing = latestChecks.filter(check => !check.ok).length
  const blocks: Section[] = [
    { key: 'files', title: `Files changed · ${fileLines.length}`, lines: fileLines },
    { key: 'commits', title: `Commits · ${commitLines.length}`, lines: commitLines },
    { key: 'checks', title: `Checks · ${checkLines.length}${failing > 0 ? `, ${failing} failing` : ''}`, lines: checkLines },
  ].filter(block => block.lines.length > 0)
  if (blocks.length === 0 && shown !== null) {
    return [{ key: 'nothing', title: null, lines: [{ text: 'Nothing changed in this step yet.', tone: 'muted' }] }]
  }

  return blocks
}

// `viewing` is the step on show when it was chosen (a press, `/monitor
// <step>`); otherwise the current step is.
export const sectionsOf = (data: SessionData, viewing: PhaseId | null = null): Section[] => {
  const shown = viewing ?? currentOf(data)

  return [stepperSection(data, shown), headerSection(data, shown), tasksSection(data, shown), ...changeSections(data, shown)].filter(
    (section): section is Section => section !== null,
  )
}
