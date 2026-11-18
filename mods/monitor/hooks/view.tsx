import type { Elements, RenderSurface } from 'claude-code'

import { cut } from './sections'
import type { Line, Section } from './sections'

type Table = Elements[RenderSurface]

export type Layout = { columns: number; rows: number; surface: RenderSurface }

const isNarrow = ({ columns, surface }: Layout) => surface === 'mobile' || columns <= 40

// Rows left after the fixed lines (the phases, the evidence, each title and
// each empty-state line), shared evenly by the titled lists, 2 at least.
const rowsPerList = (sections: readonly Section[], layout: Layout): number => {
  const fixed = sections.reduce((rows, { key, title, lines }) => {
    if (key === 'phases') return rows + (isNarrow(layout) ? lines.length : 1)

    return rows + (title === null ? lines.length : 1)
  }, 0)
  const lists = sections.filter(section => section.title !== null).length

  return Math.max(2, Math.floor(Math.max(0, layout.rows - fixed) / Math.max(1, lists)))
}

// A list that doesn't fit shows what fits, then "+N more" on the last row.
const fit = (lines: readonly Line[], rows: number) => (lines.length <= rows ? lines : cut(lines, rows - 1))

export const drawPane = ({ Box, Text }: Table, sections: readonly Section[], layout: Layout) => {
  const rows = rowsPerList(sections, layout)
  const text = (line: Line) => <Text dimColor={line.isDim}>{line.text}</Text>

  return (
    <Box flexDirection="column">
      {sections.map(({ key, title, lines }) =>
        key === 'phases' ? (
          <Box key="phases" flexDirection={isNarrow(layout) ? 'column' : 'row'} columnGap={2} flexWrap="wrap">
            {lines.map(text)}
          </Box>
        ) : (
          <Box flexDirection="column">
            {title !== null && <Text bold>{title}</Text>}
            {(title === null ? lines : fit(lines, rows)).map(text)}
          </Box>
        ),
      )}
    </Box>
  )
}
