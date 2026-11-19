// Pure: a line broken into rows of at most `width` characters, at spaces
// where it can be, mid-word where a word is longer than a row.
export const wrapText = (text: string, width: number): string[] => {
  const size = Math.max(1, width)
  const rows: string[] = []
  let row = ''
  for (const word of text.split(' ').filter(part => part !== '')) {
    if (row !== '' && row.length + 1 + word.length <= size) {
      row = `${row} ${word}`
      continue
    }
    if (row !== '') rows.push(row)
    row = word
    while (row.length > size) {
      rows.push(row.slice(0, size))
      row = row.slice(size)
    }
  }
  rows.push(row)

  return rows
}
