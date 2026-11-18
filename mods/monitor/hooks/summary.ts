import type { Section } from './sections'

// Pure: the panel as plain text, for /monitor where no screen shows panes.
// The same blocks as the pane, separated by blank lines.

const blockOf = ({ key, title, lines }: Section): string[] => {
  if (key === 'stepper') return [lines.map(line => line.text).join(' ─ ')]
  const body = lines.map(line => (line.time === undefined ? line.text : `  ${line.text} · ${line.time}`))

  return title === null ? body : [title, ...body]
}

export const summaryOf = (sections: readonly Section[]): string =>
  ['Workflow', ...sections.flatMap((section, index) => [...(index === 0 ? [] : ['']), ...blockOf(section)])].join('\n')
