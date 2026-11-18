import type { Elements, RenderSurface } from 'claude-code'

import type { Section } from './sections'

type Table = Elements[RenderSurface]

export const drawPane = ({ Box, Text }: Table, sections: readonly Section[]) => (
  <Box flexDirection="column">
    {sections.map(({ title, lines }) => (
      <Box flexDirection="column">
        {title !== null && <Text bold>{title}</Text>}
        {lines.map(line => (
          <Text dimColor={line.isDim}>{line.text}</Text>
        ))}
      </Box>
    ))}
  </Box>
)
