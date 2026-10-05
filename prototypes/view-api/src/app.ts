// PROTOTYPE — throwaway. Model, Message and update for the two demos, shared by
// every variant so only the view differs. A real app would use Foldkit's
// `defineMessageUnion` and `Schema.Struct`; Data.taggedEnum stands in here.

import { Data } from 'effect'

// COUNTER

export type CounterModel = { readonly count: number }

export type CounterMessage = Data.TaggedEnum<{
  ClickedDecrement: {}
  ClickedIncrement: {}
  ClickedReset: {}
}>
export const CounterMessage = Data.taggedEnum<CounterMessage>()

export const counterInit: CounterModel = { count: 0 }

export const counterUpdate = (
  model: CounterModel,
  message: CounterMessage,
): CounterModel =>
  CounterMessage.$match(message, {
    ClickedDecrement: () => ({ count: model.count - 1 }),
    ClickedIncrement: () => ({ count: model.count + 1 }),
    ClickedReset: () => ({ count: 0 }),
  })

// LONG LIST

export type Item = { readonly id: string; readonly title: string; readonly done: boolean }
export type ListModel = { readonly items: ReadonlyArray<Item>; readonly query: string }

export type ListMessage = Data.TaggedEnum<{
  ToggledItem: { readonly id: string }
  ChangedQuery: { readonly value: string }
  ReachedEnd: {}
}>
export const ListMessage = Data.taggedEnum<ListMessage>()

export const listInit: ListModel = {
  items: Array.from({ length: 10_000 }, (_, i) => ({
    id: `item-${i}`,
    title: `Item ${i}`,
    done: i % 3 === 0,
  })),
  query: '',
}

export const listUpdate = (model: ListModel, message: ListMessage): ListModel =>
  ListMessage.$match(message, {
    ToggledItem: ({ id }) => ({
      ...model,
      items: model.items.map(item =>
        item.id === id ? { ...item, done: !item.done } : item,
      ),
    }),
    ChangedQuery: ({ value }) => ({ ...model, query: value }),
    ReachedEnd: () => model,
  })

export const visibleItems = (model: ListModel) =>
  model.query === ''
    ? model.items
    : model.items.filter(item => item.title.includes(model.query))
