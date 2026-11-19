import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { bashFail, bashPass, edit, gitCommit, sessionStart, typedCommand, write } from './fixtures/live-events'

const PANE = {
  plugin: 'monitor',
  component: 'Pane',
  requestId: 'monitor',
  surface: 'desktop',
  props: {
    title: 'Workflow',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const CWD = sessionStart.cwd

const editFailed = {
  input: { ...edit.input, tool_use_id: 'toolu_failed_edit', file_path: `${CWD}/broken.md` },
  result: { ref: 0, isError: true, text: 'String to replace not found in file.', result: 'Error: String to replace not found in file.' },
} as const

// The engine beneath the plugin: each tool call answered as the live
// recording did, by its tool_use_id.
const engine = (on: On) => {
  const results: Record<string, unknown> = {
    [write.input.tool_use_id]: write.result,
    [edit.input.tool_use_id]: edit.result,
    [editFailed.input.tool_use_id]: editFailed.result,
    [gitCommit.input.tool_use_id]: gitCommit.result,
    [bashFail.input.tool_use_id]: bashFail.result,
    [bashPass.input.tool_use_id]: bashPass.result,
  }
  on('command.register', () => ({ value: { command: 'monitor' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.root', () => ({ value: CWD }))
  on('command.run', () => typedCommand.commandResult)
  on('tool.call', (_, e) => (results[e.tool_use_id ?? ''] ?? edit.result) as typeof edit.result)
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'no-surface: no surface is attached' } }))
}

const texts = async (ui: { findAll: (q: { type: string }) => Promise<readonly { text?: string }[]> }) =>
  (await ui.findAll({ type: 'Text' })).map(one => one.text)

test('a file written then edited shows once, as created, relative to the project root', async ($, on) => {
  mock.clock(on)
  engine(on)
  await $.session.start(sessionStart)
  await $.tool.call(write.input)
  await $.tool.call(edit.input)

  const ui = await $.ui.mount(PANE)
  const shown = await texts(ui)
  expect(shown).toContain('Files changed · 1')
  expect(shown.filter(text => text?.includes('notes.md'))).toEqual(['created notes.md'])
  await ui.unmount()
})

test('a file outside the project root keeps its full path; a failed edit is not listed', async ($, on) => {
  mock.clock(on)
  engine(on)
  await $.session.start(sessionStart)
  await $.tool.call({ ...write.input, file_path: '/tmp/elsewhere.md' })
  await $.tool.call(editFailed.input)

  const ui = await $.ui.mount(PANE)
  const shown = await texts(ui)
  expect(shown).toContain('Files changed · 1')
  expect(shown).toContain('created /tmp/elsewhere.md')
  expect(shown).not.toContain('edited broken.md')
  expect(shown).not.toContain('created broken.md')
  await ui.unmount()
})

test('a successful commit shows with its short hash and subject; a failed command adds none', async ($, on) => {
  mock.clock(on)
  engine(on)
  await $.session.start(sessionStart)
  await $.tool.call(bashFail.input)
  await $.tool.call(gitCommit.input)
  await $.tool.call(bashPass.input)

  const ui = await $.ui.mount(PANE)
  const shown = await texts(ui)
  expect(shown).toContain('Commits · 1')
  expect(shown).not.toContain('Files changed · 0')
  expect(shown).toContain('298bd7b probe: first commit')
  expect(shown.filter(text => text?.includes('298bd7b'))).toHaveLength(1)
  await ui.unmount()
})

test('with no changes no list is shown', async ($, on) => {
  mock.clock(on)
  engine(on)
  await $.session.start(sessionStart)

  const ui = await $.ui.mount(PANE)
  const shown = await texts(ui)
  expect(shown.filter(text => /^(Files changed|Commits|Checks)/.test(text ?? ''))).toEqual([])
  await ui.unmount()
})

test("/monitor's text summary lists the same files and commits", async ($, on) => {
  mock.clock(on)
  engine(on)
  await $.session.start(sessionStart)
  await $.tool.call(write.input)
  await $.tool.call(gitCommit.input)

  const out = await $.command.run({ ...typedCommand.commandRun, command: 'monitor', args: '' })
  expect(out.text).toContain('\nFiles changed · 1\n  created notes.md · just now\n')
  expect(out.text).toContain('\nCommits · 1\n  298bd7b probe: first commit · just now')
})

test('Bash, Write and Edit calls pass through unchanged', async ($, on) => {
  mock.clock(on)
  engine(on)
  await $.session.start(sessionStart)

  expect(await $.tool.call(gitCommit.input)).toEqual(gitCommit.result)
  expect(await $.tool.call(write.input)).toEqual(write.result)
  expect(await $.tool.call(editFailed.input)).toEqual(editFailed.result)
})
