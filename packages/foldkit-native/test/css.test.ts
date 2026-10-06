import { type Conditions, Engine } from '@ng-native/fabric'
import { compileCss } from '@ng-native/metro/css/compile.cjs'
import { Schema } from 'effect'
import { makeElement } from 'foldkit/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { attachStyles } from '../src/css/index.ts'
import { mount } from '../src/mount.ts'
import { nativeView } from '../src/view/index.ts'
import { createFakeFabric, type FakeFabricNode, manualFrames } from './testing.ts'

// The compiler `withTailwind` runs at build time, fed hand-written CSS in the
// shape Tailwind and ng-native's preset emit for these variants.

const sheet = compileCss(
  `
  .p-4 { padding: 16px }
  .bg-white { background-color: #ffffff }
  .dark .dark\\:bg-black { background-color: #000000 }
  .platform-ios .ios\\:rounded-xl { border-radius: 12px }
  .platform-android .android\\:rounded-md { border-radius: 6px }
  `,
  'test.css',
)

beforeEach(() => {
  vi.stubGlobal('window', globalThis)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const light: Conditions = { width: 390, height: 844, colorScheme: 'light' }

const Model = Schema.Struct({})
type Model = typeof Model.Type

const CLASSES = 'p-4 bg-white dark:bg-black ios:rounded-xl android:rounded-md'

const setup = (platform: string) => {
  const fabric = createFakeFabric()
  const engine = new Engine(fabric, 1, {
    processColor: value => value,
    globalStyles: sheet,
    conditions: light,
  })
  const setClasses = vi.spyOn(engine, 'setClasses')
  const styles = attachStyles(engine, { platform, conditions: light })
  const frames = manualFrames()
  const app = mount(
    engine,
    ({ container, platform }) =>
      makeElement({
        Model,
        init: () => ({ model: {} }),
        update: (model: Model) => ({ model }),
        view: nativeView<Model, never>((_model, n) => n.view([n.Class(CLASSES)], [])),
        container,
        platform,
      }),
    { requestAnimationFrame: frames.requestAnimationFrame },
  )
  const box = (): FakeFabricNode | undefined => fabric.committed[0]?.children[0]
  const settle = (expected: Record<string, unknown>) =>
    vi.waitFor(() => {
      frames.flush()
      expect(box()?.props).toMatchObject(expected)
    })
  return { app, styles, setClasses, settle }
}

describe('attachStyles', () => {
  it('styles a Class through the global sheet, with the platform variant of the OS', async () => {
    const { app, setClasses, settle } = setup('ios')

    await settle({ paddingTop: 16, backgroundColor: 'rgb(255, 255, 255)', borderTopLeftRadius: 12 })
    expect(setClasses).toHaveBeenCalledWith(expect.anything(), CLASSES)
    app.dispose()
  })

  it('picks the android variant on android', async () => {
    const { app, settle } = setup('android')

    await settle({ paddingTop: 16, borderTopLeftRadius: 6 })
    app.dispose()
  })

  it('restyles the committed tree when the color scheme turns dark', async () => {
    const { app, styles, settle } = setup('ios')
    await settle({ backgroundColor: 'rgb(255, 255, 255)' })

    styles.update({ ...light, colorScheme: 'dark' })
    await settle({ backgroundColor: 'rgb(0, 0, 0)' })

    styles.update(light)
    await settle({ backgroundColor: 'rgb(255, 255, 255)' })
    app.dispose()
  })
})
