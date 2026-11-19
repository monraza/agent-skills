import type { Elements, RenderSurface } from 'claude-code'

import type { GroupId, PhaseId } from '../types'

import type { Line, Section, Tone } from './sections'
import { wrapText } from './wrap'

type Table = Elements[RenderSurface]

// `rows`: the pane body's rows (its `scroll.bodyRows`), which the drawing
// keeps within, so the engine never scrolls it and the stepper stays put.
export type Layout = { columns: number; surface: RenderSurface; rows: number }

// What the pane's buttons do: a step in the stepper, the button back to the
// current step, and a task group's name.
export type Actions = { onStep: (phase: PhaseId) => void; onBack: () => void; onGroup: (group: GroupId) => void }

// A drawing, and how far its rows can scroll under the stepper.
export type Drawn<T> = { tree: T; maxTop: number }

const isNarrow = ({ columns, surface }: Pick<Layout, 'columns' | 'surface'>) => surface === 'mobile' || columns <= 40

// A row kept for a heading drawn taller than one line on a graphical surface.
const SLACK = 1

// The theme's own colors, so the pane follows the person's theme: its accent
// for the current step, success and error for ✓ and ✗, dim for the rest.
const STYLE: Record<Tone, { color?: string; weight?: 'bold'; dimColor?: boolean }> = {
  current: { color: 'claude', weight: 'bold' },
  done: { color: 'success' },
  failed: { color: 'error' },
  normal: {},
  muted: { dimColor: true },
}

// The stepper's rows: one per step when stacked; otherwise its text, with
// ' ─ ' between steps, over the width.
export const stepperRows = (lines: readonly Line[], layout: Pick<Layout, 'columns' | 'surface'>): number => {
  if (isNarrow(layout)) return lines.length
  const width = lines.reduce((sum, line) => sum + line.text.length, 0) + 3 * Math.max(0, lines.length - 1)

  return Math.max(1, Math.ceil(width / Math.max(1, layout.columns)))
}

// The stepper and the step's header, pinned at the top; below them, a window
// of `top` onward over the rest, one line to a row, as many rows as fit.
export const drawPane = (
  { Box, Button, Text }: Table,
  sections: readonly Section[],
  layout: Layout,
  actions: Actions,
  top: number,
) => {
  const text = (line: Line) => (
    <Text {...STYLE[line.tone]} wrap="truncate-end">
      {line.text}
    </Text>
  )

  // A started or done step is a plain button that shows it; the step on
  // show, when it isn't the current one, is underlined.
  const step = (line: Line) =>
    line.phase === undefined ? (
      <Text {...STYLE[line.tone]}>{line.text}</Text>
    ) : (
      <Button key={`step-${line.phase}`} plain onPress={() => actions.onStep(line.phase as PhaseId)}>
        <Text {...STYLE[line.tone]} underline={line.selected === true}>
          {line.text}
        </Text>
      </Button>
    )

  // The six steps: one row with ─ between them, or one per line when narrow.
  const stepper = (lines: readonly Line[]) =>
    isNarrow(layout) ? (
      <Box key="phases" flexDirection="column">
        {lines.map(step)}
      </Box>
    ) : (
      <Box key="phases" flexDirection="row" columnGap={1} flexWrap="wrap">
        {lines.flatMap((line, index) => (index === 0 ? [step(line)] : [<Text dimColor>─</Text>, step(line)]))}
      </Box>
    )

  const heading = (line: Line) => (
    <Text {...STYLE[line.tone]} size="heading" weight="bold" wrap="truncate-end">
      {line.text}
    </Text>
  )

  // The step's name, large; for an earlier step, the button back to the
  // current one on the right, named after it.
  const header = (lines: readonly Line[]) =>
    lines.map((line, index) =>
      index !== 0 ? (
        text(line)
      ) : line.back !== undefined ? (
        <Box flexDirection="row" justifyContent="space-between" columnGap={2}>
          {heading(line)}
          <Button key="back" onPress={actions.onBack}>
            {line.back}
          </Button>
        </Box>
      ) : (
        heading(line)
      ),
    )

  // A line that wraps, as rows that fit beside its indent; the rows after
  // the first sit under its text, past a mark such as ✓, ○ or •.
  const wrapped = (line: Line, indent: number) => {
    const mark = /^[✓○•●] /.test(line.text) ? 2 : 0
    const [first = '', ...rest] = wrapText(line.text, Math.max(10, layout.columns - 2 * indent - mark))

    return [
      <Box paddingLeft={2 * indent}>
        <Text {...STYLE[line.tone]}>{first}</Text>
      </Box>,
      ...rest.map(part => (
        <Box paddingLeft={2 * indent + mark}>
          <Text {...STYLE[line.tone]}>{part}</Text>
        </Box>
      )),
    ]
  }

  // A line's rows: what happened on the left, when on the right. A task
  // group's name is a button that folds it (▾ unfolded, ▸ folded); a task or
  // a detail sits indented under what it belongs to.
  const rowsOfLine = (line: Line) => {
    const indent = line.indent ?? 0
    if (line.wrap === true) return wrapped(line, indent)
    if (indent > 0 && line.group === undefined) return [<Box paddingLeft={2 * indent}>{row(line)}</Box>]

    return [row(line)]
  }

  const row = (line: Line) =>
    line.group !== undefined ? (
      <Button key={`group-${line.group}`} plain onPress={() => actions.onGroup(line.group as GroupId)}>
        <Text {...STYLE[line.tone]} wrap="truncate-end">{`${line.open === true ? '▾' : '▸'} ${line.text}`}</Text>
      </Button>
    ) : line.time === undefined ? (
      text(line)
    ) : (
      <Box flexDirection="row" justifyContent="space-between" columnGap={2}>
        {text(line)}
        <Text dimColor>{line.time}</Text>
      </Box>
    )

  // Every block after the stepper as rows: a blank row between blocks, then
  // its title, then its lines.
  const rowsOf = (blocks: readonly Section[]) =>
    blocks.flatMap(({ key, title, lines }, index) => [
      ...(index === 0 ? [] : [<Text> </Text>]),
      ...(title === null
        ? []
        : [
            <Text size="caption" weight="semibold" dimColor wrap="truncate-end">
              {title}
            </Text>,
          ]),
      ...(key === 'header' ? header(lines) : lines.flatMap(rowsOfLine)),
    ])

  // The stepper and the step's header stay put; the blocks after them scroll.
  const steps = sections.find(section => section.key === 'stepper')
  const head = sections.find(section => section.key === 'header')
  const rows = rowsOf(sections.filter(section => section !== steps && section !== head))
  const pinnedRows =
    (steps === undefined ? 0 : stepperRows(steps.lines, layout)) + (head === undefined ? 0 : head.lines.length + 1) + 1
  const room = Math.max(1, layout.rows - pinnedRows - SLACK)
  const maxTop = Math.max(0, rows.length - room)
  const from = Math.min(Math.max(0, top), maxTop)

  return {
    maxTop,
    tree: (
      <Box flexDirection="column">
        {steps !== undefined && stepper(steps.lines)}
        {head !== undefined && (
          <Box key="header" flexDirection="column" marginTop={1}>
            {header(head.lines)}
          </Box>
        )}
        <Box key="body" flexDirection="column" marginTop={1}>
          {rows.slice(from, from + room)}
        </Box>
      </Box>
    ),
  }
}
