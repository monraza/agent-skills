import type { Elements, RenderSurface } from 'claude-code'

import type { ActivityEntry } from '../types'

type Table = Elements[RenderSurface]

export type PaneData = { activity: readonly ActivityEntry[] }

export const drawPane = ({ Box, Text }: Table, { activity }: PaneData) => (
  <Box flexDirection="column">
    {activity.length === 0 && <Text dimColor>No phase yet</Text>}
    {activity.length === 0 && <Text dimColor>No activity yet.</Text>}
  </Box>
)
