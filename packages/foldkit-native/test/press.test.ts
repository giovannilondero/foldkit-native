import { Engine } from '@ng-native/fabric'
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { makeElement } from 'foldkit/runtime'
import { describe, expect, it, vi } from 'vitest'

import { mount } from '../src/mount.ts'
import { type NativeBuilder, nativeView } from '../src/view/index.ts'
import { createFakeFabric, type FakeFabricNode, manualFrames } from './testing.ts'

// NOTE: React Native's setUpGlobals aliases `window` and `self` to the global
// object, and Foldkit's runtime reads `window.self` at boot. Node has neither.
vi.stubGlobal('window', globalThis)

const Message = defineMessageUnion({ PressedCard: {} })
type Message = typeof Message.Type

const Model = Schema.Struct({ presses: Schema.Number })
type Model = typeof Model.Type

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

describe('n.pressable', () => {
  it('with Disabled but no OnPress, does not take the touch from the pressable around it', async () => {
    const view = (model: Model, n: NativeBuilder<Message>) =>
      n.pressable(
        [n.TestID('card'), n.OnPress(Message.PressedCard())],
        [
          n.text([], [`presses:${model.presses}`]),
          n.pressable([n.TestID('badge'), n.Disabled(false)], [n.text([], ['badge'])]),
        ],
      )

    const fabric = createFakeFabric()
    const engine = new Engine(fabric, 1, { processColor: value => value })
    const frames = manualFrames()
    const app = mount(
      engine,
      ({ container, platform }) =>
        makeElement({
          Model,
          init: () => ({ model: { presses: 0 } }),
          update: (model: Model, _message: Message) => ({
            model: { presses: model.presses + 1 },
          }),
          view: nativeView(view),
          container,
          platform,
        }),
      { requestAnimationFrame: frames.requestAnimationFrame },
    )
    const settle = (text: string) =>
      vi.waitFor(() => {
        frames.flush()
        expect(fabric.render()).toContain(`RawText "${text}"`)
      })

    await settle('presses:0')
    const badge = findByTestID(fabric.committed, 'badge')!
    const point = { identifier: 0, target: badge.reactTag, pageX: 5, pageY: 5, timestamp: 0 }
    fabric.emit(badge, 'topTouchStart', { ...point, touches: [point], changedTouches: [point] })
    fabric.emit(badge, 'topTouchEnd', { ...point, touches: [], changedTouches: [point] })

    await settle('presses:1')
    app.dispose()
  })
})
