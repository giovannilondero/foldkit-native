import { Engine } from '@ng-native/fabric'
import { mount } from 'foldkit-native/mount'
import { createFakeFabric, type FakeFabricNode, manualFrames } from 'foldkit-native/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { makeSpike } from './app'

// NOTE: React Native aliases `window` to the global object and Foldkit reads
// `window.self` at boot. Node has no `window`.
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

const setup = () => {
  const fabric = createFakeFabric()
  const engine = new Engine(fabric, 1, { processColor: value => value })
  const frames = manualFrames()
  const app = mount(engine, makeSpike, { requestAnimationFrame: frames.requestAnimationFrame })

  /** Runs frames until `isSettled` holds. Returns the commits it took. */
  const settle = async (isSettled: () => boolean): Promise<number> => {
    const commitsBefore = fabric.calls.completeRoot
    await vi.waitFor(() => {
      frames.flush()
      expect(isSettled()).toBe(true)
    })
    return fabric.calls.completeRoot - commitsBefore
  }

  const byTestID = (testID: string): FakeFabricNode | undefined =>
    findByTestID(fabric.committed, testID)

  /** A tap through the Engine's responder system, as Fabric sends it. */
  const tap = (testID: string): void => {
    const node = byTestID(testID)
    if (node === undefined) {
      throw new Error(`Nothing committed with testID ${testID}`)
    }
    const point = { identifier: 0, target: node.reactTag, pageX: 5, pageY: 5, timestamp: 0 }
    fabric.emit(node, 'topTouchStart', { ...point, touches: [point], changedTouches: [point] })
    fabric.emit(node, 'topTouchEnd', { ...point, touches: [], changedTouches: [point] })
  }

  const has = (text: string) => () => fabric.render().includes(`RawText "${text}"`)

  return { fabric, app, settle, byTestID, tap, has }
}

describe('Spike app', () => {
  it('opens the Counter from the menu, counts presses with one commit each, and goes back', async () => {
    const { fabric, app, settle, byTestID, tap, has } = setup()
    await settle(() => byTestID('menu.Counter') !== undefined)

    tap('menu.Counter')
    await settle(has('Count: 0'))
    expect(byTestID('menu.Counter')).toBeUndefined()

    tap('counter.increment')
    expect(await settle(has('Count: 1'))).toBe(1)
    tap('counter.increment')
    expect(await settle(has('Count: 2'))).toBe(1)

    tap('back')
    await settle(() => byTestID('menu.Counter') !== undefined)
    // The Counter's subtree is gone from the committed tree.
    expect(byTestID('counter.increment')).toBeUndefined()
    expect(fabric.render()).not.toContain('Count:')

    // Re-entering starts a fresh Counter.
    tap('menu.Counter')
    await settle(has('Count: 0'))
    app.dispose()
  })
})
