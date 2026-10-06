import { Engine } from '@ng-native/fabric'
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { makeElement } from 'foldkit/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mount } from '../src/mount.ts'
import { nativeView, type NativeBuilder } from '../src/view/index.ts'
import { createFakeFabric, type FakeFabricNode, manualFrames } from './testing.ts'

// NOTE: React Native aliases `window` to the global object and Foldkit reads
// `window.self` at boot. Node has no `window`.
beforeEach(() => {
  vi.stubGlobal('window', globalThis)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const Model = Schema.Struct({ text: Schema.String })
type Model = typeof Model.Type

const Message = defineMessageUnion({
  ChangedText: { text: Schema.String },
  ClickedClear: {},
})
type Message = typeof Message.Type

/** A field whose update applies `transform`; returning `undefined` keeps the
 *  Model as it was (the same reference, so Foldkit does not render). */
const setup = (transform: (text: string) => string | undefined) => {
  const fabric = createFakeFabric()
  const engine = new Engine(fabric, 1, { processColor: value => value })
  const frames = manualFrames()
  const view = (model: Model, n: NativeBuilder<Message>) =>
    n.view(
      [],
      [
        n.textInput([
          n.TestID('field'),
          n.Value(model.text),
          n.OnChangeText(text => Message.ChangedText({ text })),
        ]),
        n.pressable([n.TestID('clear'), n.OnPress(Message.ClickedClear())]),
      ],
    )
  const app = mount(
    engine,
    ({ container, platform }) =>
      makeElement({
        Model,
        init: () => ({ model: { text: '' } }),
        update: (model: Model, message: Message) =>
          Message.match(message, {
            ChangedText: ({ text }) => {
              const next = transform(text)
              return { model: next === undefined ? model : { text: next } }
            },
            ClickedClear: () => ({ model: { text: '' } }),
          }),
        view: nativeView(view),
        container,
        platform,
      }),
    { requestAnimationFrame: frames.requestAnimationFrame },
  )

  const field = (): FakeFabricNode => {
    const found = fabric.find('TextInput')
    if (found === undefined) {
      throw new Error('no TextInput committed')
    }
    return found
  }
  const settle = (isSettled: () => boolean) =>
    vi.waitFor(() => {
      frames.flush()
      expect(isSettled()).toBe(true)
    })
  /** Native's `topChange` for one keystroke: the field's whole text. */
  const type = (text: string, eventCount: number) =>
    fabric.emit(field(), 'topChange', { text, eventCount, target: field().reactTag })
  const textCommands = () =>
    fabric.commands.filter(command => command.name === 'setTextAndSelection')

  const hasField = () => fabric.find('TextInput') !== undefined

  return { fabric, frames, app, field, hasField, settle, type, textCommands }
}

describe('n.textInput', () => {
  it('echoes a Model transform back to native, stamped with the event it answers', async () => {
    const { app, field, hasField, settle, type, textCommands } = setup(text =>
      text.toUpperCase(),
    )
    await settle(hasField)

    type('a', 1)
    await settle(() => field().props['text'] === 'A')

    expect(field().props['mostRecentEventCount']).toBe(1)
    expect(textCommands()).toEqual([
      { viewName: 'TextInput', name: 'setTextAndSelection', args: [1, 'A', -1, -1] },
    ])
    app.dispose()
  })

  it('keeps every keystroke when several arrive before a frame', async () => {
    const { app, field, hasField, settle, type, textCommands } = setup(text =>
      text.toUpperCase(),
    )
    await settle(hasField)

    type('a', 1)
    type('ab', 2)
    type('abc', 3)
    await settle(() => field().props['text'] === 'ABC')

    // One frame answered the latest edit; nothing older reached native.
    expect(field().props['mostRecentEventCount']).toBe(3)
    expect(textCommands().map(command => command.args)).toEqual([[3, 'ABC', -1, -1]])
    app.dispose()
  })

  it('sends nothing while the Model takes the text as native shows it', async () => {
    const { app, field, hasField, settle, type, textCommands } = setup(text => text)
    await settle(hasField)

    type('a', 1)
    type('ab', 2)
    await settle(() => field().props['text'] === 'ab')

    expect(textCommands()).toEqual([])
    app.dispose()
  })

  it('reverts an edit the update rejects by keeping the Model', async () => {
    const { app, field, hasField, settle, type, textCommands } = setup(text =>
      /^\d*$/.test(text) ? text : undefined,
    )
    await settle(hasField)
    type('1', 1)
    await settle(() => field().props['text'] === '1')

    type('1x', 2)
    await settle(() => textCommands().length > 0)

    expect(textCommands().map(command => command.args)).toEqual([[2, '1', -1, -1]])
    app.dispose()
  })

  it('pushes a Model change made elsewhere, such as a reset, to native', async () => {
    const { fabric, app, field, hasField, settle, type, textCommands } = setup(text => text)
    await settle(hasField)
    type('hello', 5)
    await settle(() => field().props['text'] === 'hello')

    const clear = fabric.find('View')!.children[0]!.children[1]!
    const point = { identifier: 0, target: clear.reactTag, pageX: 1, pageY: 1, timestamp: 0 }
    fabric.emit(clear, 'topTouchStart', { ...point, touches: [point], changedTouches: [point] })
    fabric.emit(clear, 'topTouchEnd', { ...point, touches: [], changedTouches: [point] })
    await settle(() => field().props['text'] === '')

    expect(textCommands().map(command => command.args)).toEqual([[5, '', -1, -1]])
    app.dispose()
  })
})
