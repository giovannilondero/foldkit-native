import { Array, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type { Html, NativeBuilder } from 'foldkit-native/view'

import { defineDemo } from '../demo'

// Rung 3: 1,000 keyed rows in a plain `n.scrollView`. No virtualization:
// every row is a native view, and the row's `n.Key` (its id) lets snabbdom
// move, insert and drop rows without touching their neighbours' nodes.

const INITIAL_ROW_COUNT = 1000

export const Model = Schema.Struct({
  rowIds: Schema.Array(Schema.Number),
  nextId: Schema.Number,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ClickedPrepend: {},
  ClickedRemoveFirst: {},
  ClickedRemoveMiddle: {},
})
export type Message = typeof Message.Type

const init = (): { model: Model } => ({
  model: {
    rowIds: Array.makeBy(INITIAL_ROW_COUNT, index => index + 1),
    nextId: INITIAL_ROW_COUNT + 1,
  },
})

const update = (model: Model, message: Message): { model: Model } =>
  Message.match(message, {
    ClickedPrepend: () => ({
      model: { rowIds: Array.prepend(model.rowIds, model.nextId), nextId: model.nextId + 1 },
    }),
    ClickedRemoveFirst: () => ({
      model: { ...model, rowIds: Array.drop(model.rowIds, 1) },
    }),
    ClickedRemoveMiddle: () => ({
      model: {
        ...model,
        rowIds: Array.remove(model.rowIds, Math.floor(model.rowIds.length / 2)),
      },
    }),
  })

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
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 8,
        backgroundColor: '#111827',
      }),
    ],
    [n.text([n.Style({ color: 'white', fontSize: 16, fontWeight: '600' })], [label])],
  )

const row = (n: NativeBuilder<Message>, id: number): Html =>
  n.view(
    [
      n.Key(id),
      n.TestID(`longList.row.${id}`),
      n.Style({
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
        backgroundColor: id % 2 === 0 ? '#f9fafb' : 'white',
      }),
    ],
    [n.text([n.Style({ fontSize: 18 })], [`Row ${id}`])],
  )

const view = (model: Model, n: NativeBuilder<Message>): Html =>
  n.view(
    [n.Style({ flex: 1 })],
    [
      n.view(
        [n.Style({ flexDirection: 'row', gap: 8, paddingHorizontal: 24, paddingBottom: 12 })],
        [
          button(n, 'longList.prepend', Message.ClickedPrepend(), 'Prepend'),
          button(n, 'longList.removeFirst', Message.ClickedRemoveFirst(), 'Remove first'),
          button(n, 'longList.removeMiddle', Message.ClickedRemoveMiddle(), 'Remove middle'),
        ],
      ),
      n.text(
        [n.TestID('longList.count'), n.Style({ paddingHorizontal: 24, paddingBottom: 8 })],
        [`${model.rowIds.length} rows`],
      ),
      n.scrollView(
        [n.TestID('longList.scroll'), n.Style({ flex: 1 })],
        model.rowIds.map(id => row(n, id)),
      ),
    ],
  )

export const demo = defineDemo<Model, Message>({
  title: 'Long list',
  init,
  update,
  view,
})
