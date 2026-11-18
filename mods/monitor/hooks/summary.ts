import type { Section } from './sections'

// Pure: the panel as plain text, for /monitor where no screen shows panes.

const INTRO = 'No screen here shows panes, so here is the Workflow panel as text.'

const linesOf = ({ title, lines }: Section): string[] =>
  title === null ? lines.map(line => line.text) : [`${title}: ${lines.map(line => line.text).join('; ')}`]

// A blank line sets the phase block apart from the lists below it.
const blockOf = (section: Section): string[] =>
  section.key === 'phase' ? [...linesOf(section), ''] : linesOf(section)

export const summaryOf = (sections: readonly Section[]): string =>
  [INTRO, '', 'Workflow', ...sections.flatMap(blockOf)].join('\n')
