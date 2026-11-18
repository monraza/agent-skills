import type { Elements, RenderSurface } from 'claude-code'

import type { Line, Section, Tone } from './sections'

type Table = Elements[RenderSurface]

export type Layout = { columns: number; surface: RenderSurface }

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

export const drawPane = ({ Box, Text }: Table, sections: readonly Section[], layout: Layout) => {
  const text = (line: Line) => <Text {...STYLE[line.tone]}>{line.text}</Text>

  // The six steps: one row with ─ between them, or one per line when narrow.
  const stepper = (lines: readonly Line[]) =>
    isNarrow(layout) ? (
      <Box key="phases" flexDirection="column">
        {lines.map(text)}
      </Box>
    ) : (
      <Box key="phases" flexDirection="row" columnGap={1} flexWrap="wrap">
        {lines.flatMap((line, index) => (index === 0 ? [text(line)] : [<Text dimColor>─</Text>, text(line)]))}
      </Box>
    )

  // The current step's name, large; then what started it, and progress.
  const current = (lines: readonly Line[]) =>
    lines.map((line, index) =>
      index === 0 ? (
        <Text {...STYLE[line.tone]} size="heading" weight="bold">
          {line.text}
        </Text>
      ) : (
        text(line)
      ),
    )

  // A Recent row: what happened on the left, when on the right.
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
            {key === 'current' ? current(lines) : lines.map(row)}
          </Box>
        ),
      )}
    </Box>
  )
}
