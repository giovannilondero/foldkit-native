import { describe, expect, it } from 'vitest'

import { n } from '../src/view/index.ts'

describe('n.scrollView', () => {
  it('draws scroll-view > view[collapsable=false] > children', () => {
    const scroll = n.scrollView([n.TestID('list')], [n.text([], ['row'])])

    expect(scroll.sel).toBe('scroll-view')
    expect(scroll.data?.props).toEqual({ testID: 'list' })
    const [content] = scroll.children as ReadonlyArray<typeof scroll>
    expect(content?.sel).toBe('view')
    expect(content?.data?.props).toEqual({ collapsable: false })
    expect((content?.children as ReadonlyArray<typeof scroll>)[0]?.sel).toBe('text')
  })
})
