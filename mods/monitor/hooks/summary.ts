import type { Section } from './sections'

// Pure: the panel as plain text, for /monitor where no screen shows panes.
// The same blocks as the pane, separated by blank lines.

const blockOf = ({ key, title, lines }: Section): string[] => {
  if (key === 'stepper') return [lines.map(line => line.text).join(' ─ ')]
  if (title === null) return lines.map(line => line.text)

  return [title, ...lines.map(line => `  ${line.text}${line.time === undefined ? '' : ` · ${line.time}`}`)]
}

export const summaryOf = (sections: readonly Section[]): string =>
  ['Workflow', ...sections.flatMap((section, index) => [...(index === 0 ? [] : ['']), ...blockOf(section)])].join('\n')
