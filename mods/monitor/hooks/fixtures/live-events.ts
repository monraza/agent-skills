// Event inputs and results recorded from a real Claude Code 2.1.326 session
// (cloud, 2026-11-18) by a throwaway probe mod, trimmed to the fields the
// monitor reads. Integration tests build their events from these records, not
// from hand-written shapes (SPEC.md success criterion 16). Paths are rewritten
// to /home/user/project; long text is shortened; nothing else is changed.
//
// What the recording showed:
// - Bash: a non-zero exit adds `isError: true` to the tool.call result, and
//   `result` becomes the error text (a string), not the Bash record. A zero
//   exit has no `isError` key at all.
// - A successful `git commit` carries `result.gitOperation.commit` with the
//   short sha and branch. The subject only appears in stdout, on the
//   `[branch sha] subject` line.
// - TaskCreate's result has the new id at `result.task.id`. TaskUpdate's has
//   `taskId` and, on a status change, `statusChange: { from, to }`.
// - skill.prompt names a plugin skill with its prefix
//   (`anthropic-skills:brand-guidelines`); the frontmatter name is bare. It
//   fires while the Skill tool call runs: after tool.call's input, before its
//   result.
// - Project commands from .claude/commands are listed by bare name (`spec`,
//   `plan`, ...). No command named `monitor` exists.
// - Edit and Write inputs carry an absolute `file_path`.
// - session.start in this cloud session: `surface: null`,
//   `isInteractive: false`.

export const sessionStart = {
  cwd: '/home/user/project',
  surface: null,
  isInteractive: false,
} as const

export const commandNames = [
  'startup-hook-skill', 'build', 'code-simplify', 'constraints', 'plan',
  'review', 'ship', 'spec', 'test', 'webperf', 'design', 'slides', 'dataviz',
  'update-config', 'keybindings-help', 'verify',
] as const

export const bashPass = {
  input: {
    tool: 'Bash',
    tool_use_id: 'toolu_015UHJBzRo5FzaQ4XZWEMbqH',
    command: 'echo probe-pass',
    description: 'Run a passing command for the probe',
  },
  result: {
    ref: 0,
    isReadOnly: true,
    text: 'probe-pass',
    result: {
      stdout: 'probe-pass',
      stderr: '',
      interrupted: false,
      isImage: false,
      noOutputExpected: false,
    },
  },
} as const

export const bashFail = {
  input: {
    tool: 'Bash',
    tool_use_id: 'toolu_01MwH29PFoLhG5sqRVGAAF4u',
    command: 'echo probe-fail >&2; exit 3',
    description: 'Run a failing command for the probe',
  },
  result: {
    ref: 0,
    isError: true,
    text: 'Exit code 3\nprobe-fail',
    result: 'Error: Exit code 3\nprobe-fail',
  },
} as const

export const gitCommit = {
  input: {
    tool: 'Bash',
    tool_use_id: 'toolu_01KdjkkZSSGwVJW5EggENvZi',
    command: 'git add a.txt && git commit -m "probe: first commit"',
    description: 'Make a commit in a throwaway scratch repo',
  },
  result: {
    ref: 0,
    text: '[master (root-commit) 298bd7b] probe: first commit\n 1 file changed, 1 insertion(+)\n create mode 100644 a.txt',
    result: {
      stdout: '[master (root-commit) 298bd7b] probe: first commit\n 1 file changed, 1 insertion(+)\n create mode 100644 a.txt',
      stderr: '',
      interrupted: false,
      isImage: false,
      noOutputExpected: false,
      gitOperation: {
        commit: { sha: '298bd7b', kind: 'committed', branch: 'master' },
      },
    },
  },
} as const

export const taskCreate = {
  input: {
    tool: 'TaskCreate',
    tool_use_id: 'toolu_012LpJsScjLD7xEJvaeZmgdb',
    subject: 'Task 1: Live event check for the monitor mod',
    description: 'Record real engine events with the probe mod.',
    activeForm: 'Recording live engine events',
  },
  result: {
    ref: 0,
    text: 'Task #1 created successfully: Task 1: Live event check for the monitor mod',
    result: {
      task: {
        id: '1',
        subject: 'Task 1: Live event check for the monitor mod',
        description: 'Record real engine events with the probe mod.',
      },
    },
  },
} as const

export const taskUpdate = {
  input: {
    tool: 'TaskUpdate',
    tool_use_id: 'toolu_011DFYd8swCCgBPRPitTLzNh',
    taskId: '1',
    status: 'in_progress',
  },
  result: {
    ref: 0,
    text: 'Updated task #1 status',
    result: {
      success: true,
      taskId: '1',
      updatedFields: ['status'],
      statusChange: { from: 'pending', to: 'in_progress' },
    },
  },
} as const

export const write = {
  input: {
    tool: 'Write',
    tool_use_id: 'toolu_01A4yjkLyGavcuTSka2E9BTv',
    file_path: '/home/user/project/notes.md',
    content: '- [ ] first\n- [x] second\n',
  },
  result: {
    ref: 0,
    text: 'File created successfully at: /home/user/project/notes.md',
    result: {
      type: 'create',
      filePath: '/home/user/project/notes.md',
      content: '- [ ] first\n- [x] second\n',
      structuredPatch: [],
      originalFile: null,
      userModified: false,
    },
  },
} as const

export const edit = {
  input: {
    tool: 'Edit',
    tool_use_id: 'toolu_013jvLdDZKr3Jb7Xnga8mgxS',
    file_path: '/home/user/project/notes.md',
    old_string: '- [ ] first',
    new_string: '- [x] first',
    replace_all: false,
  },
  result: {
    ref: 0,
    text: 'The file /home/user/project/notes.md has been updated successfully.',
    result: {
      filePath: '/home/user/project/notes.md',
      oldString: '- [ ] first',
      newString: '- [x] first',
      originalFile: '- [ ] first\n- [x] second\n',
      structuredPatch: [],
      userModified: false,
      replaceAll: false,
    },
  },
} as const

export const skillToolCall = {
  input: {
    tool: 'Skill',
    tool_use_id: 'toolu_01Xc4igiRhi7KWxFuVHizrfz',
    skill: 'anthropic-skills:brand-guidelines',
    args: 'Probe only.',
  },
  result: {
    ref: 0,
    text: 'Launching skill: anthropic-skills:brand-guidelines',
    result: { success: true, commandName: 'anthropic-skills:brand-guidelines' },
  },
} as const

export const skillPrompt = {
  skill: 'anthropic-skills:brand-guidelines',
  source: 'syncedSkills',
  frontmatter: { name: 'brand-guidelines' },
  text: '# Anthropic Brand Styling\n…',
} as const
