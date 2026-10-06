import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type { Html, NativeBuilder } from 'foldkit-native/view'

import { defineDemo } from '../demo'

// Rung 2: a controlled field whose update uppercases what native reports.
// Fast typing keeps every character and the cursor stays put; see the text
// input protocol in `packages/foldkit-native/src/platform/textInput.ts`.

export const Model = Schema.Struct({ text: Schema.String })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ChangedText: { text: Schema.String },
  ClickedClear: {},
})
export type Message = typeof Message.Type

const view = (model: Model, n: NativeBuilder<Message>): Html =>
  n.view(
    [n.Style({ flex: 1, padding: 24, gap: 16 })],
    [
      n.textInput([
        n.TestID('textInput.field'),
        n.AccessibilityLabel('Uppercase field'),
        n.Value(model.text),
        n.Placeholder('Type here'),
        // NOTE: the uppercase comes from the Model, not the keyboard: keep
        // the keyboard's own capitalisation and corrections out of it.
        n.AutoCorrect(false),
        n.AutoCapitalize('none'),
        n.OnChangeText(text => Message.ChangedText({ text })),
        n.Style({
          fontSize: 20,
          padding: 12,
          borderWidth: 1,
          borderColor: '#9ca3af',
          borderRadius: 8,
        }),
      ]),
      n.text(
        [n.TestID('textInput.echo'), n.Style({ fontSize: 16, color: '#374151' })],
        [`Model: ${model.text} (${model.text.length})`],
      ),
      n.pressable(
        [
          n.TestID('textInput.clear'),
          n.AccessibilityLabel('Clear'),
          n.OnPress(Message.ClickedClear()),
          n.Style({
            alignSelf: 'flex-start',
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderRadius: 8,
            backgroundColor: '#111827',
          }),
        ],
        [n.text([n.Style({ color: 'white', fontSize: 16, fontWeight: '600' })], ['Clear'])],
      ),
    ],
  )

export const demo = defineDemo<Model, Message>({
  title: 'Text input',
  init: () => ({ model: { text: '' } }),
  update: (_model, message) =>
    Message.match(message, {
      ChangedText: ({ text }) => ({ model: { text: text.toUpperCase() } }),
      ClickedClear: () => ({ model: { text: '' } }),
    }),
  view,
})
