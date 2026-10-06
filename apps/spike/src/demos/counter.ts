import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type { Html, NativeBuilder } from 'foldkit-native/view'

import { defineDemo } from '../demo'

// Rung 1: a pressable increments, the text updates, one commit per frame.

export const Model = Schema.Struct({ count: Schema.Number })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ClickedIncrement: {},
  ClickedDecrement: {},
  ClickedReset: {},
})
export type Message = typeof Message.Type

const button = (
  n: NativeBuilder<Message>,
  testID: string,
  message: Message,
  label: string,
): Html =>
  n.pressable(
    [
      n.TestID(testID),
      n.AccessibilityLabel(label),
      n.OnPress(message),
      n.Style({
        minWidth: 64,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 8,
        backgroundColor: '#111827',
        alignItems: 'center',
      }),
    ],
    [n.text([n.Style({ color: 'white', fontSize: 20, fontWeight: '600' })], [label])],
  )

const view = (model: Model, n: NativeBuilder<Message>): Html =>
  n.view(
    [n.Style({ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 })],
    [
      n.text(
        [n.TestID('counter.count'), n.Style({ fontSize: 48, fontWeight: '700' })],
        [`Count: ${model.count}`],
      ),
      n.view(
        [n.Style({ flexDirection: 'row', gap: 12 })],
        [
          button(n, 'counter.decrement', Message.ClickedDecrement(), '-'),
          button(n, 'counter.reset', Message.ClickedReset(), 'Reset'),
          button(n, 'counter.increment', Message.ClickedIncrement(), '+'),
        ],
      ),
    ],
  )

export const demo = defineDemo<Model, Message>({
  title: 'Counter',
  init: () => ({ model: { count: 0 } }),
  update: (model, message) =>
    Message.match(message, {
      ClickedIncrement: () => ({ model: { count: model.count + 1 } }),
      ClickedDecrement: () => ({ model: { count: model.count - 1 } }),
      ClickedReset: () => ({ model: { count: 0 } }),
    }),
  view,
})
