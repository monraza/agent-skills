export type PhaseId = 'define' | 'plan' | 'build' | 'verify' | 'review' | 'ship'

export type ActivityEntry = {
  at: number
  kind: 'command' | 'skill'
  name: string
  phase: PhaseId | null
  setsPhase: boolean
}

declare module 'claude-code' {
  interface PluginState {
    monitor: { activity: Shaped<ActivityEntry[]> }
  }
}
