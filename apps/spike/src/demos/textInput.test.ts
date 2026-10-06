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

  const settle = (isSettled: () => boolean) =>
    vi.waitFor(() => {
      frames.flush()
      expect(isSettled()).toBe(true)
    })
  const byTestID = (testID: string): FakeFabricNode => {
    const node = findByTestID(fabric.committed, testID)
    if (node === undefined) {
      throw new Error(`Nothing committed with testID ${testID}`)
    }
    return node
  }
  const isShown = (testID: string) => () => findByTestID(fabric.committed, testID) !== undefined
  const tap = (testID: string): void => {
    const node = byTestID(testID)
    const point = { identifier: 0, target: node.reactTag, pageX: 5, pageY: 5, timestamp: 0 }
    fabric.emit(node, 'topTouchStart', { ...point, touches: [point], changedTouches: [point] })
    fabric.emit(node, 'topTouchEnd', { ...point, touches: [], changedTouches: [point] })
  }
  const type = (text: string, eventCount: number): void => {
    const field = byTestID('textInput.field')
    fabric.emit(field, 'topChange', { text, eventCount, target: field.reactTag })
  }
  const textCommands = () =>
    fabric.commands
      .filter(command => command.name === 'setTextAndSelection')
      .map(command => command.args)

  return { fabric, app, settle, byTestID, isShown, tap, type, textCommands }
}

describe('Text input demo', () => {
  it('uppercases fast typing without losing a keystroke, and clears', async () => {
    const { fabric, app, settle, byTestID, isShown, tap, type, textCommands } = setup()
    await settle(isShown('menu.TextInput'))
    tap('menu.TextInput')
    await settle(isShown('textInput.field'))

    // Native has run ahead of JS: three edits land before one frame.
    type('h', 1)
    type('he', 2)
    type('hey', 3)
    await settle(() => byTestID('textInput.field').props['text'] === 'HEY')
    expect(fabric.render()).toContain('RawText "Model: HEY (3)"')
    expect(textCommands()).toEqual([[3, 'HEY', -1, -1]])

    // Native echoes the command's text with the same count, then the user
    // types on: the Model already agrees, so nothing more is sent.
    type('HEY!', 4)
    await settle(() => byTestID('textInput.field').props['text'] === 'HEY!')
    expect(textCommands()).toEqual([[3, 'HEY', -1, -1]])

    tap('textInput.clear')
    await settle(() => byTestID('textInput.field').props['text'] === '')
    expect(textCommands().at(-1)).toEqual([4, '', -1, -1])
    app.dispose()
  })
})
