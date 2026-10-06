import { type Conditions, Engine } from '@ng-native/fabric'
import { attachStyles } from 'foldkit-native/css'
import { mount } from 'foldkit-native/mount'
import { createFakeFabric, type FakeFabricNode, manualFrames } from 'foldkit-native/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Written by `withTailwind` (vitest.tailwind.mts runs the Metro config first).
import tailwind from '../../.tailwind/app.tailwind.js'
import { makeSpike } from '../app'

beforeEach(() => {
  vi.stubGlobal('window', globalThis)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const findByTestID = (
  nodes: ReadonlyArray<FakeFabricNode>,
  testID: string,
): FakeFabricNode | undefined => {
  for (const node of nodes) {
    const hit = node.props['testID'] === testID ? node : findByTestID(node.children, testID)
    if (hit !== undefined) {
      return hit
    }
  }
  return undefined
}

const light: Conditions = { width: 390, height: 844, colorScheme: 'light' }

// Tailwind 4's palette, as the device receives it.
const INDIGO_600 = 'rgb(79, 57, 246)'
const INDIGO_800 = 'rgb(55, 42, 172)'
const WHITE = 'rgb(255, 255, 255)'
const SLATE_900 = 'rgb(15, 23, 43)'

const setup = () => {
  const fabric = createFakeFabric()
  const engine = new Engine(fabric, 1, {
    processColor: value => value,
    globalStyles: tailwind,
    conditions: light,
  })
  const styles = attachStyles(engine, { platform: 'ios', conditions: light })
  const frames = manualFrames()
  const app = mount(engine, makeSpike, { requestAnimationFrame: frames.requestAnimationFrame })

  const byTestID = (testID: string): FakeFabricNode | undefined =>
    findByTestID(fabric.committed, testID)

  const settle = (isSettled: () => void) =>
    vi.waitFor(() => {
      frames.flush()
      isSettled()
    })

  const touch = (testID: string, phase: 'topTouchStart' | 'topTouchEnd'): void => {
    const node = byTestID(testID)
    if (node === undefined) {
      throw new Error(`Nothing committed with testID ${testID}`)
    }
    const point = { identifier: 0, target: node.reactTag, pageX: 5, pageY: 5, timestamp: 0 }
    fabric.emit(node, phase, {
      ...point,
      touches: phase === 'topTouchStart' ? [point] : [],
      changedTouches: [point],
    })
  }
  const tap = (testID: string): void => {
    touch(testID, 'topTouchStart')
    touch(testID, 'topTouchEnd')
  }

  return { fabric, app, styles, byTestID, settle, touch, tap }
}

describe('Counter (Tailwind)', () => {
  it('is styled by its Tailwind classes and counts like the inline Counter', async () => {
    const { fabric, app, byTestID, settle, tap } = setup()
    await settle(() => expect(byTestID('menu.TailwindCounter')).toBeDefined())

    tap('menu.TailwindCounter')
    await settle(() => expect(byTestID('tailwind.increment')).toBeDefined())

    // px-4 py-3 rounded-lg bg-indigo-600
    expect(byTestID('tailwind.increment')?.props).toMatchObject({
      paddingLeft: 16,
      paddingTop: 12,
      borderTopLeftRadius: 8,
      backgroundColor: INDIGO_600,
    })
    // text-5xl font-bold, inherited by the raw text from its paragraph
    expect(byTestID('tailwind.count')?.props).toMatchObject({ fontSize: 48, fontWeight: '700' })
    expect(byTestID('tailwind.screen')?.props).toMatchObject({ backgroundColor: WHITE })

    tap('tailwind.increment')
    tap('tailwind.increment')
    await settle(() => expect(fabric.render()).toContain('RawText "Count: 2"'))
    app.dispose()
  })

  it('follows the color scheme through dark:', async () => {
    const { app, styles, byTestID, settle, tap } = setup()
    await settle(() => expect(byTestID('menu.TailwindCounter')).toBeDefined())
    tap('menu.TailwindCounter')
    await settle(() => expect(byTestID('tailwind.screen')).toBeDefined())

    styles.update({ ...light, colorScheme: 'dark' })
    await settle(() =>
      expect(byTestID('tailwind.screen')?.props).toMatchObject({ backgroundColor: SLATE_900 }),
    )
    app.dispose()
  })

  it('shows the pressed state (active:) while a finger is down', async () => {
    const { app, byTestID, settle, touch, tap } = setup()
    await settle(() => expect(byTestID('menu.TailwindCounter')).toBeDefined())
    tap('menu.TailwindCounter')
    await settle(() => expect(byTestID('tailwind.increment')).toBeDefined())

    touch('tailwind.increment', 'topTouchStart')
    await settle(() =>
      expect(byTestID('tailwind.increment')?.props).toMatchObject({ backgroundColor: INDIGO_800 }),
    )
    touch('tailwind.increment', 'topTouchEnd')
    await settle(() =>
      expect(byTestID('tailwind.increment')?.props).toMatchObject({ backgroundColor: INDIGO_600 }),
    )
    app.dispose()
  })
})
