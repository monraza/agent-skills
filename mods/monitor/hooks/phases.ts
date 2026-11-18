import type { ActivityEntry, PhaseId, Turn } from '../types'

// Pure: no `$`, no I/O. The phase table (SPEC.md, Phase rules) and the rules
// for which command or skill sets the active phase.

export const PHASES: readonly PhaseId[] = ['define', 'plan', 'build', 'verify', 'review', 'ship']

export const PHASE_LABEL: Record<PhaseId, string> = {
  define: 'Define',
  plan: 'Plan',
  build: 'Build',
  verify: 'Verify',
  review: 'Review',
  ship: 'Ship',
}

// `null`: in the table, with no phase. A name missing from a table is not in it.
const COMMAND_PHASE: Readonly<Record<string, PhaseId | null>> = {
  spec: 'define',
  plan: 'plan',
  build: 'build',
  test: 'verify',
  review: 'review',
  'code-simplify': 'review',
  webperf: 'review',
  ship: 'ship',
  constraints: null,
}

const SKILL_PHASE: Readonly<Record<string, PhaseId | null>> = {
  'interview-me': 'define',
  'idea-refine': 'define',
  'spec-driven-development': 'define',
  'planning-and-task-breakdown': 'plan',
  'incremental-implementation': 'build',
  'test-driven-development': 'build',
  'context-engineering': 'build',
  'source-driven-development': 'build',
  'doubt-driven-development': 'build',
  'frontend-ui-engineering': 'build',
  'api-and-interface-design': 'build',
  'browser-testing-with-devtools': 'verify',
  'debugging-and-error-recovery': 'verify',
  'code-review-and-quality': 'review',
  'code-simplification': 'review',
  'security-and-hardening': 'review',
  'performance-optimization': 'review',
  'git-workflow-and-versioning': 'ship',
  'ci-cd-and-automation': 'ship',
  'deprecation-and-migration': 'ship',
  'documentation-and-adrs': 'ship',
  'observability-and-instrumentation': 'ship',
  'shipping-and-launch': 'ship',
  'constraint-driven-development': null,
  'using-agent-skills': null,
}

// `/spec` from this repo's .claude/commands, `agent-skills:spec` installed.
export const bareName = (name: string): string => name.replace(/^agent-skills:/, '')

const lookup = (table: Readonly<Record<string, PhaseId | null>>, name: string) => {
  const bare = bareName(name)

  return Object.hasOwn(table, bare) ? table[bare] : undefined
}

export const phaseOfCommand = (name: string): PhaseId | null | undefined => lookup(COMMAND_PHASE, name)

export const phaseOfSkill = (name: string): PhaseId | null | undefined => lookup(SKILL_PHASE, name)

const commandHasPhase = (name: string | null): boolean => name !== null && (phaseOfCommand(name) ?? null) !== null

export const NEW_TURN: Turn = { pendingCommand: null, startedWithCommand: false }

export const afterCommand = (turn: Turn, name: string): Turn => ({ ...turn, pendingCommand: bareName(name) })

export const afterTurnStart = (turn: Turn): Turn => ({
  pendingCommand: null,
  startedWithCommand: commandHasPhase(turn.pendingCommand),
})

// A typed command fires skill.prompt for its own expansion before its turn
// starts (the live recording); that event repeats the command.
export const isOwnExpansion = (turn: Turn, skill: string): boolean =>
  turn.pendingCommand !== null && turn.pendingCommand === bareName(skill)

export const commandEntry = (name: string, at: number): ActivityEntry => {
  const phase = phaseOfCommand(name) ?? null

  return { at, kind: 'command', name, phase, setsPhase: phase !== null }
}

export const skillEntry = (name: string, at: number, turn: Turn): ActivityEntry => {
  const phase = phaseOfSkill(name) ?? null
  const commandHoldsTurn = turn.startedWithCommand || commandHasPhase(turn.pendingCommand)

  return { at, kind: 'skill', name, phase, setsPhase: phase !== null && !commandHoldsTurn }
}

export type PhaseState = 'todo' | 'active' | 'visited'

export type PhaseView = {
  active: (ActivityEntry & { phase: PhaseId }) | null
  states: Record<PhaseId, PhaseState>
}

const setsAPhase = (entry: ActivityEntry): entry is ActivityEntry & { phase: PhaseId } =>
  entry.setsPhase && entry.phase !== null

export const phaseViewOf = (activity: readonly ActivityEntry[]): PhaseView => {
  const setters = activity.filter(setsAPhase)
  const active = setters.at(-1) ?? null
  const states: Record<PhaseId, PhaseState> = {
    define: 'todo',
    plan: 'todo',
    build: 'todo',
    verify: 'todo',
    review: 'todo',
    ship: 'todo',
  }
  for (const entry of setters) states[entry.phase] = 'visited'
  if (active !== null) states[active.phase] = 'active'

  return { active, states }
}
