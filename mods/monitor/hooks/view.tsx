import type { Elements, RenderSurface } from 'claude-code'

import type { Line, Section } from './sections'

type Table = Elements[RenderSurface]

export type Layout = { columns: number; surface: RenderSurface }

const isNarrow = ({ columns, surface }: Layout) => surface === 'mobile' || columns <= 40

export const drawPane = ({ Box, Text }: Table, sections: readonly Section[], layout: Layout) => {
  const text = (line: Line) => <Text dimColor={line.tone === 'muted'}>{line.text}</Text>
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
          <Box key="phases" flexDirection={isNarrow(layout) ? 'column' : 'row'} columnGap={2} flexWrap="wrap">
            {lines.map(text)}
          </Box>
        ) : (
          <Box flexDirection="column">
            {title !== null && <Text bold>{title}</Text>}
            {lines.map(row)}
          </Box>
        ),
      )}
    </Box>
  )
}
