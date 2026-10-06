import { Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { make, persistent } from 'foldkit/subscription'
import { appState } from 'foldkit-native/subscription'
import type { Html, NativeBuilder } from 'foldkit-native/view'

import { defineDemo } from '../demo'

// Rung 5: React Native's AppState as a Foldkit Subscription, with no Foldkit
// change. Counts trips to the background and back while the demo is open.

export const Model = Schema.Struct({
  state: Schema.String,
  /** Set on `background`, cleared on the next `active`: iOS passes through
   *  `inactive` both ways, which on its own is no transition. */
  isBackgrounded: Schema.Boolean,
  backgrounded: Schema.Number,
  foregrounded: Schema.Number,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ChangedAppState: { state: Schema.String },
})
export type Message = typeof Message.Type

const changedAppState = (model: Model, state: string): Model => {
  if (state === 'background' && !model.isBackgrounded) {
    return { ...model, state, isBackgrounded: true, backgrounded: model.backgrounded + 1 }
  }
  if (state === 'active' && model.isBackgrounded) {
    return { ...model, state, isBackgrounded: false, foregrounded: model.foregrounded + 1 }
  }
  return { ...model, state }
}

const subscriptions = make<Model, Message>()(() => ({
  appState: persistent(appState.pipe(Stream.map(state => Message.ChangedAppState({ state })))),
}))

const line = (n: NativeBuilder<Message>, testID: string, text: string, size: number): Html =>
  n.text([n.TestID(testID), n.Style({ fontSize: size, fontWeight: '600' })], [text])

const view = (model: Model, n: NativeBuilder<Message>): Html =>
  n.view(
    [n.Style({ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 })],
    [
      line(n, 'appState.state', `State: ${model.state}`, 32),
      line(n, 'appState.backgrounded', `Backgrounded: ${model.backgrounded}`, 24),
      line(n, 'appState.foregrounded', `Foregrounded: ${model.foregrounded}`, 24),
      n.text(
        [n.Style({ fontSize: 16, color: '#6b7280', marginTop: 24 })],
        ['Send the app to the background and bring it back.'],
      ),
    ],
  )

export const demo = defineDemo<Model, Message>({
  title: 'AppState',
  init: () => ({
    model: { state: 'unknown', isBackgrounded: false, backgrounded: 0, foregrounded: 0 },
  }),
  update: (model, message) =>
    Message.match(message, {
      ChangedAppState: ({ state }) => ({ model: changedAppState(model, state) }),
    }),
  view,
  subscriptions,
})
