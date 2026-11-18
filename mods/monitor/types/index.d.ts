export type PhaseId = 'define' | 'plan' | 'build' | 'verify' | 'review' | 'ship'

export type ActivityEntry = {
  at: number
  kind: 'command' | 'skill'
  name: string
  phase: PhaseId | null
  setsPhase: boolean
}

// What the current turn means for skills: a typed command arrives before its
// turn.start, so `pendingCommand` holds it until then.
export type Turn = {
  pendingCommand: string | null
  startedWithCommand: boolean
}

export type TodoCount = { done: number; total: number }

// What the working directory's files say: counts and flags, never contents.
export type Artifacts = {
  hasSpec: boolean
  hasPlan: boolean
  todo: TodoCount | null
}

declare module 'claude-code' {
  interface PluginState {
    monitor: {
      activity: Shaped<ActivityEntry[]>
      artifacts: Shaped<Artifacts>
      turn: Shaped<Turn>
      // Bumped once a minute, so a drawing reading it redraws its relative times.
      tick: number
    }
  }
}
