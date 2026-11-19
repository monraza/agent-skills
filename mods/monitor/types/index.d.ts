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

// One task line of tasks/todo.md: its title and whether it's checked.
// `number`: the N of `Task N:`, or else the task's place in the list.
// `started`: some of a task heading's boxes are checked.
// `details`: the lines under the task in tasks/todo.md, as written (at most 30, then '…').
export type TodoTask = { number: string; title: string; done: boolean; started: boolean; details: string[] }

// What the working directory's files say: flags, counts, and the todo's task
// lines (the only file text kept, for Build's task list).
export type Artifacts = {
  hasSpec: boolean
  // The spec files found, relative to the working directory, SPEC.md first.
  specPaths: string[]
  hasPlan: boolean
  todo: TodoCount | null
  todoTasks: TodoTask[]
}

export type Commit = { sha: string; subject: string; at: number }

// One change to a file: its path relative to the working directory, when,
// and whether it created the file (a Write reporting `create`).
export type FileChange = { path: string; at: number; created: boolean }

export type Check = { at: number; label: string; ok: boolean }

// Build's task groups, and which are unfolded.
export type GroupId = 'completed' | 'working' | 'todo'
export type OpenGroups = Record<GroupId, boolean>

export type TaskStatus = 'pending' | 'in_progress' | 'completed'

export type SessionTask = { id: string; subject: string; status: TaskStatus; description: string }

declare module 'claude-code' {
  interface PluginState {
    monitor: {
      activity: Shaped<ActivityEntry[]>
      artifacts: Shaped<Artifacts>
      // Every change, oldest first.
      files: Shaped<FileChange[]>
      commits: Shaped<Commit[]>
      checks: Shaped<Check[]>
      tasks: Shaped<SessionTask[]>
      // Set once the pane has been opened, by the mod or by /monitor: the mod
      // opens it on its own at most once per session.
      hasOpened: boolean
      // The step chosen to show (a press, `/monitor <step>`); null for the current one.
      viewing: PhaseId | null
      // Which of Build's task groups are unfolded in the pane.
      groups: Shaped<OpenGroups>
      // The first of the pane's own rows on show under the pinned stepper.
      scrollTop: number
      turn: Shaped<Turn>
      // Bumped once a minute, so a drawing reading it redraws its relative times.
      tick: number
    }
  }
}
