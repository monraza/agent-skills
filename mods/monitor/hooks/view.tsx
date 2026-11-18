import type { Elements, RenderSurface } from 'claude-code'

import type { GroupId, PhaseId } from '../types'

import type { Line, Section, Tone } from './sections'

type Table = Elements[RenderSurface]

export type Layout = { columns: number; surface: RenderSurface }

// What the pane's buttons do: a step in the stepper, the button back to the
// current step, and a task group's name.
export type Actions = { onStep: (phase: PhaseId) => void; onBack: () => void; onGroup: (group: GroupId) => void }

const isNarrow = ({ columns, surface }: Layout) => surface === 'mobile' || columns <= 40

// The theme's own colors, so the pane follows the person's theme: its accent
// for the current step, success and error for ✓ and ✗, dim for the rest.
const STYLE: Record<Tone, { color?: string; weight?: 'bold'; dimColor?: boolean }> = {
  current: { color: 'claude', weight: 'bold' },
  done: { color: 'success' },
  failed: { color: 'error' },
  normal: {},
  muted: { dimColor: true },
}

export const drawPane = ({ Box, Button, Text }: Table, sections: readonly Section[], layout: Layout, actions: Actions) => {
  const text = (line: Line) => <Text {...STYLE[line.tone]}>{line.text}</Text>

  // A started or done step is a plain button that shows it; the step on
  // show, when it isn't the current one, is underlined.
  const step = (line: Line) =>
    line.phase === undefined ? (
      text(line)
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
    <Text {...STYLE[line.tone]} size="heading" weight="bold">
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

  // A row: what happened on the left, when on the right. A task group's name
  // is a button that folds it (▾ unfolded, ▸ folded); a task sits under it.
  const row = (line: Line) =>
    line.group !== undefined ? (
      <Button key={`group-${line.group}`} plain onPress={() => actions.onGroup(line.group as GroupId)}>
        <Text {...STYLE[line.tone]}>{`${line.open === true ? '▾' : '▸'} ${line.text}`}</Text>
      </Button>
    ) : line.indent === true ? (
      <Box paddingLeft={2}>{text(line)}</Box>
    ) : line.time === undefined ? (
      text(line)
    ) : (
      <Box flexDirection="row" justifyContent="space-between" columnGap={2}>
        {text(line)}
        <Text dimColor>{line.time}</Text>
      </Box>
    )

  return (
    <Box flexDirection="column">
      {sections.map(({ key, title, lines }) =>
        key === 'stepper' ? (
          stepper(lines)
        ) : (
          <Box key={key} flexDirection="column" marginTop={1}>
            {title !== null && (
              <Text size="caption" weight="semibold" dimColor>
                {title}
              </Text>
            )}
            {key === 'header' ? header(lines) : lines.map(row)}
          </Box>
        ),
      )}
    </Box>
  )
}
