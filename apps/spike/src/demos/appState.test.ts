import { Engine } from '@ng-native/fabric'
import { mount } from 'foldkit-native/mount'
import {
  createFakeFabric,
  type FakeFabricNode,
  fakeAppState,
  manualFrames,
} from 'foldkit-native/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { makeSpike } from '../app'

// NOTE: React Native aliases `window` to the global object and Foldkit reads
// `window.self` at boot. Node has no `window`.
beforeEach(() => {
  vi.stubGlobal('window', globalThis)
})
afterEach(() => {
  vi.unstubAllGlobals()
  fakeAppState.set('active')
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

  const settle = async (isSettled: () => boolean): Promise<void> => {
    await vi.waitFor(() => {
      frames.flush()
      expect(isSettled()).toBe(true)
    })
  }

  const byTestID = (testID: string): FakeFabricNode | undefined =>
    findByTestID(fabric.committed, testID)

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

  return { app, settle, byTestID, tap, has }
}

describe('AppState demo', () => {
  it('counts background and foreground transitions while open, and stops listening on back', async () => {
    const { app, settle, byTestID, tap, has } = setup()
    await settle(() => byTestID('menu.AppState') !== undefined)
    expect(fakeAppState.listenerCount()).toBe(0)

    tap('menu.AppState')
    await settle(has('State: active'))
    expect(fakeAppState.listenerCount()).toBe(1)
    expect(has('Backgrounded: 0')()).toBe(true)
    expect(has('Foregrounded: 0')()).toBe(true)

    // iOS passes through `inactive` both ways; it is not a transition.
    fakeAppState.set('inactive')
    fakeAppState.set('background')
    await settle(has('Backgrounded: 1'))
    fakeAppState.set('inactive')
    fakeAppState.set('active')
    await settle(has('Foregrounded: 1'))
    expect(has('State: active')()).toBe(true)

    // Android goes straight between the two.
    fakeAppState.set('background')
    fakeAppState.set('active')
    await settle(has('Foregrounded: 2'))
    expect(has('Backgrounded: 2')()).toBe(true)

    tap('back')
    await settle(() => byTestID('menu.AppState') !== undefined)
    await vi.waitFor(() => expect(fakeAppState.listenerCount()).toBe(0))

    // Re-opening starts from zero with a fresh listener.
    tap('menu.AppState')
    await settle(has('Backgrounded: 0'))
    expect(fakeAppState.listenerCount()).toBe(1)
    app.dispose()
    await vi.waitFor(() => expect(fakeAppState.listenerCount()).toBe(0))
  })
})
