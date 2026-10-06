import { Engine } from '@ng-native/fabric'
import { mount } from 'foldkit-native/mount'
import { createFakeFabric, type FakeFabricNode, manualFrames } from 'foldkit-native/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { makeSpike } from '../app'

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

  const tap = (testID: string): void => {
    const node = byTestID(testID)
    if (node === undefined) {
      throw new Error(`Nothing committed with testID ${testID}`)
    }
    const point = { identifier: 0, target: node.reactTag, pageX: 5, pageY: 5, timestamp: 0 }
    fabric.emit(node, 'topTouchStart', { ...point, touches: [point], changedTouches: [point] })
    fabric.emit(node, 'topTouchEnd', { ...point, touches: [], changedTouches: [point] })
  }

  /** The rows, in committed order, as `testID → native tag`. */
  const rows = (): ReadonlyArray<readonly [string, number]> => {
    const scroll = byTestID('longList.scroll')
    const content = scroll?.children[0]
    return (content?.children ?? []).map(
      row => [String(row.props['testID']), row.reactTag] as const,
    )
  }

  return { fabric, app, settle, byTestID, tap, rows }
}

describe('Long list demo', () => {
  it('renders 1,000 keyed rows and keeps native identity across prepend and remove', async () => {
    const { fabric, app, settle, byTestID, tap, rows } = setup()
    await settle(() => byTestID('menu.LongList') !== undefined)

    tap('menu.LongList')
    await settle(() => rows().length === 1000)
    const initial = rows()
    expect(initial[0]?.[0]).toBe('longList.row.1')
    expect(initial[999]?.[0]).toBe('longList.row.1000')

    // Prepend: one commit, one new row on top, every other row the same native node.
    const createdBefore = fabric.calls.createNode
    tap('longList.prepend')
    expect(await settle(() => rows().length === 1001)).toBe(1)
    const prepended = rows()
    expect(prepended[0]?.[0]).toBe('longList.row.1001')
    expect(prepended.slice(1)).toEqual(initial)
    // Only the new row's nodes (pressable, text, raw text) and the count's raw text.
    expect(fabric.calls.createNode - createdBefore).toBeLessThan(10)

    // Remove first: one commit, the rest untouched.
    tap('longList.removeFirst')
    expect(await settle(() => rows().length === 1000)).toBe(1)
    expect(rows()).toEqual(initial)

    // Remove middle: one commit, the neighbours keep their nodes.
    const createdBeforeRemove = fabric.calls.createNode
    tap('longList.removeMiddle')
    expect(await settle(() => rows().length === 999)).toBe(1)
    expect(rows()).toEqual([...initial.slice(0, 500), ...initial.slice(501)])
    expect(fabric.calls.createNode - createdBeforeRemove).toBeLessThan(5)

    app.dispose()
  })
})
