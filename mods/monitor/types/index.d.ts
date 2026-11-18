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

export type Commit = { sha: string; subject: string; at: number }

// A changed file, relative to the working directory, and when it last changed.
export type FileChange = { path: string; at: number }

export type Check = { at: number; label: string; ok: boolean }

export type TaskStatus = 'pending' | 'in_progress' | 'completed'

export type SessionTask = { id: string; subject: string; status: TaskStatus }

declare module 'claude-code' {
  interface PluginState {
    monitor: {
      activity: Shaped<ActivityEntry[]>
      artifacts: Shaped<Artifacts>
      // Each file once, most recently changed last.
      files: Shaped<FileChange[]>
      commits: Shaped<Commit[]>
      checks: Shaped<Check[]>
      tasks: Shaped<SessionTask[]>
      // Set once the pane has been opened, by the mod or by /monitor: the mod
      // opens it on its own at most once per session.
      hasOpened: boolean
      turn: Shaped<Turn>
      // Bumped once a minute, so a drawing reading it redraws its relative times.
      tick: number
    }
  }
}
