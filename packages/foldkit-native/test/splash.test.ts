import { Engine } from '@ng-native/fabric'
import { describe, expect, it } from 'vitest'

import { mountSplash } from '../src/index.ts'
import { createFakeFabric } from './fakeFabric.ts'

describe('mountSplash', () => {
  it('commits a full-height view holding the label as native text', () => {
    const fabric = createFakeFabric()
    const engine = new Engine(fabric, 1, { processColor: value => value })

    mountSplash(engine, 'Foldkit Native')

    // Fabric component names: a `<text>` commits as Paragraph, its run of text as RawText.
    expect(fabric.render()).toBe(
      ['View', '  Paragraph', '    RawText "Foldkit Native"'].join('\n'),
    )
    // Fabric receives style flattened into the node's props.
    expect(fabric.committed[0]?.props).toMatchObject({ height: '100%' })
  })
})
