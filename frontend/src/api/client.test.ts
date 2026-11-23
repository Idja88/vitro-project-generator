import { describe, expect, it } from 'vitest'

import { apiUrl, projectIdFromLocation } from './client'

describe('projectIdFromLocation', () => {
  it.each([
    ['/project/604576aa-3777', '604576aa-3777'],
    ['/generator/project/604576aa-3777', '604576aa-3777'],
    ['/generator/project/604576aa-3777/', '604576aa-3777'],
    ['/generator/', null],
    ['/project/', null],
  ])('%s → %s', (pathname, expected) => {
    expect(projectIdFromLocation(pathname)).toBe(expected)
  })
})

describe('apiUrl', () => {
  it('строится от <base href>, поэтому учитывает префикс приложения', () => {
    const base = document.createElement('base')
    base.href = 'http://host/generator/'
    document.head.appendChild(base)
    try {
      expect(apiUrl('projects/P1')).toBe('http://host/generator/api/v1/projects/P1')
    } finally {
      base.remove()
    }
  })
})
