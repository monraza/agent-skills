import { describe, expect, test } from 'claude-code/testing'

import { wrapText } from './wrap'

describe('wrapping a line', () => {
  test('breaks at spaces, each row at most the width', () => {
    expect(wrapText('one two three four', 9)).toEqual(['one two', 'three', 'four'])
    expect(wrapText('fits', 10)).toEqual(['fits'])
  })

  test('breaks a word longer than a row', () => {
    expect(wrapText('abcdefghij kl', 4)).toEqual(['abcd', 'efgh', 'ij', 'kl'])
  })

  test('an empty line is one empty row', () => {
    expect(wrapText('', 5)).toEqual([''])
  })
})
