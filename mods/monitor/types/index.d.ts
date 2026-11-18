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

declare module 'claude-code' {
  interface PluginState {
    monitor: {
      activity: Shaped<ActivityEntry[]>
      turn: Shaped<Turn>
      // Bumped once a minute, so a drawing reading it redraws its relative times.
      tick: number
    }
  }
}
