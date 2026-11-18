import type { Elements, RenderSurface } from 'claude-code'

import type { PhaseId } from '../types'

import type { Line, Section, Tone } from './sections'

type Table = Elements[RenderSurface]

export type Layout = { columns: number; surface: RenderSurface }

// What the pane's buttons do: a step in the stepper, and Back.
export type Actions = { onStep: (phase: PhaseId) => void; onBack: () => void }

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

  // Each step is a plain button that opens its look-back view.
  const step = (line: Line) =>
    line.phase === undefined ? (
      text(line)
    ) : (
      <Button key={`step-${line.phase}`} plain onPress={() => actions.onStep(line.phase as PhaseId)}>
        {text(line)}
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

  // The step's name, large; looking back, with Back on the right.
  const header = (key: string, lines: readonly Line[]) =>
    lines.map((line, index) =>
      index !== 0 ? (
        text(line)
      ) : key === 'lookback' ? (
        <Box flexDirection="row" justifyContent="space-between" columnGap={2}>
          {heading(line)}
          <Button key="back" onPress={actions.onBack}>
            Back
          </Button>
        </Box>
      ) : (
        heading(line)
      ),
    )

  // A row: what happened on the left, when on the right.
  const row = (line: Line) =>
    line.time === undefined ? (
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
            {key === 'current' || key === 'lookback' ? header(key, lines) : lines.map(row)}
          </Box>
        ),
      )}
    </Box>
  )
}
