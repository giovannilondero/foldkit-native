// PROTOTYPE — throwaway.
//
// VARIANT B: a separate NativeBuilder `n`, built like Foldkit's HtmlBuilder
// (attribute arrays + children arrays, attributes as a TaggedEnum, the
// builder handed to the view by the runtime) but speaking Native Elements:
//
//   n.View  n.Text  n.Pressable  n.ScrollView  n.TextInput  (+ n.List)
//
// Each element accepts only its own attributes (Foldkit already does this
// for e.g. TextareaAttribute). Text is typed: a raw string is only a valid
// child of n.Text, so RN's "Text strings must be rendered within a <Text>"
// becomes a compile error instead of a red screen.

import { Data } from 'effect'
import {
  CounterMessage,
  ListMessage,
  visibleItems,
  type CounterModel,
  type Item,
  type ListModel,
} from './app'
import { send, type Html, type VNode } from './vnode'

// RN-style inline style: camelCase, numbers are dp. (A subset, for show.)
type NativeStyle = Readonly<{
  flex?: number
  padding?: number
  gap?: number
  backgroundColor?: string
  color?: string
  fontSize?: number
}>

type NativeAttribute<Message> = Data.TaggedEnum<{
  Key: { readonly value: string }
  Class: { readonly value: string }
  Style: { readonly value: NativeStyle }
  TestId: { readonly value: string }
  AccessibilityLabel: { readonly value: string }
  OnPress: { readonly message: Message }
  OnLongPress: { readonly message: Message }
  NumberOfLines: { readonly value: number }
  Value: { readonly value: string }
  Placeholder: { readonly value: string }
  KeyboardType: { readonly value: 'Default' | 'NumberPad' | 'EmailAddress' }
  OnChangeText: { readonly f: (text: string) => Message }
  OnSubmitEditing: { readonly message: Message }
}>
const A = Data.taggedEnum<NativeAttribute<any>>()

type Common = 'Key' | 'Class' | 'Style' | 'TestId' | 'AccessibilityLabel'
type Pick<Message, Tags extends NativeAttribute<Message>['_tag']> = Extract<NativeAttribute<Message>, { _tag: Tags }>
type ViewAttribute<M> = Pick<M, Common>
type PressableAttribute<M> = Pick<M, Common | 'OnPress' | 'OnLongPress'>
type TextAttribute<M> = Pick<M, Common | 'NumberOfLines' | 'OnPress'>
type TextInputAttribute<M> = Pick<M, Common | 'Value' | 'Placeholder' | 'KeyboardType' | 'OnChangeText' | 'OnSubmitEditing'>

// Text nodes are branded so only n.Text can produce them, and only they (and
// strings) may sit inside n.Text.
declare const textBrand: unique symbol
type TextHtml = VNode & { readonly [textBrand]: true }

const build = <M>(sel: string, attributes: ReadonlyArray<NativeAttribute<M>>, children: ReadonlyArray<VNode | string | null>): VNode => {
  const data: VNode['data'] & { props: Record<string, unknown>; on: Record<string, (p: unknown) => unknown> } = { props: {}, on: {} }
  for (const attribute of attributes) {
    A.$match(attribute, {
      Key: ({ value }) => { data.key = value },
      Class: ({ value }) => { data.class = value },
      Style: ({ value }) => { data.style = value },
      TestId: ({ value }) => { data.props.testID = value },
      AccessibilityLabel: ({ value }) => { data.props.accessibilityLabel = value },
      OnPress: ({ message }) => { data.on.press = () => send(message) },
      OnLongPress: ({ message }) => { data.on.longPress = () => send(message) },
      NumberOfLines: ({ value }) => { data.props.numberOfLines = value },
      Value: ({ value }) => { data.props.value = value },
      Placeholder: ({ value }) => { data.props.placeholder = value },
      KeyboardType: ({ value }) => { data.props.keyboardType = value },
      OnChangeText: ({ f }) => { data.on.changeText = text => send(f(String(text))) },
      OnSubmitEditing: ({ message }) => { data.on.submitEditing = () => send(message) },
    })
  }
  return { sel, data, children: children.filter((c): c is VNode | string => c !== null) }
}

// A virtualised list as a builder-level element: the view says what each row
// is, the list decides which rows exist. The window is shown fixed here; a real
// one tracks scroll offset in its own state, not the app Model.
type ListConfig<M, T> = Readonly<{
  items: ReadonlyArray<T>
  key: (item: T) => string
  estimatedItemHeight: number
  row: (item: T) => Html
  onEndReached?: M
  attributes?: ReadonlyArray<ViewAttribute<M>>
}>

const makeNativeBuilder = <M>() => ({
  View: (attributes: ReadonlyArray<ViewAttribute<M>>, children: ReadonlyArray<Html> = []): Html =>
    build('RCTView', attributes, children),
  Pressable: (attributes: ReadonlyArray<PressableAttribute<M>>, children: ReadonlyArray<Html> = []): Html =>
    build('RCTView', attributes, children), // press protocol on an RCTView, as ng-native does
  ScrollView: (attributes: ReadonlyArray<ViewAttribute<M>>, children: ReadonlyArray<Html> = []): Html =>
    build('RCTScrollView', attributes, children),
  Text: (attributes: ReadonlyArray<TextAttribute<M>>, children: ReadonlyArray<string | TextHtml>): TextHtml =>
    build('RCTText', attributes, children.map(c => (typeof c === 'string' ? c : { ...c, sel: 'RCTVirtualText' }))) as TextHtml,
  TextInput: (attributes: ReadonlyArray<TextInputAttribute<M>>): Html =>
    build('RCTSinglelineTextInputView', attributes, []),
  List: <T>(config: ListConfig<M, T>): Html => {
    const window = config.items.slice(0, 12)
    const scroll = build('RCTScrollView', config.attributes ?? [], [
      ...window.map(item => {
        const row = config.row(item)
        return row === null ? null : { ...row, data: { ...row.data, key: config.key(item) } }
      }),
      build('RCTView', [A.Style({ value: { flex: 0 } })], []), // spacer standing in for the unrendered rows
    ])
    return { ...scroll, data: { ...scroll.data, props: { ...scroll.data.props, window: `0..${window.length} of ${config.items.length}` } } }
  },
  empty: null,
  Key: (value: string): ViewAttribute<M> => A.Key({ value }),
  Class: (value: string): ViewAttribute<M> => A.Class({ value }),
  Style: (value: NativeStyle): ViewAttribute<M> => A.Style({ value }),
  TestId: (value: string): ViewAttribute<M> => A.TestId({ value }),
  AccessibilityLabel: (value: string): ViewAttribute<M> => A.AccessibilityLabel({ value }),
  OnPress: (message: M): Pick<M, 'OnPress'> => A.OnPress({ message }),
  OnLongPress: (message: M): PressableAttribute<M> => A.OnLongPress({ message }),
  NumberOfLines: (value: number): TextAttribute<M> => A.NumberOfLines({ value }),
  Value: (value: string): TextInputAttribute<M> => A.Value({ value }),
  Placeholder: (value: string): TextInputAttribute<M> => A.Placeholder({ value }),
  KeyboardType: (value: 'Default' | 'NumberPad' | 'EmailAddress'): TextInputAttribute<M> => A.KeyboardType({ value }),
  OnChangeText: (f: (text: string) => M): TextInputAttribute<M> => A.OnChangeText({ f }),
  OnSubmitEditing: (message: M): TextInputAttribute<M> => A.OnSubmitEditing({ message }),
})
type NativeBuilder<M> = ReturnType<typeof makeNativeBuilder<M>>

// ---------------------------------------------------------------------------
// The views, as an app author would write them.

export const counterView = (model: CounterModel, n: NativeBuilder<CounterMessage>): Html =>
  n.View(
    [n.Class('flex-1 items-center justify-center gap-6 bg-white')],
    [
      n.Text([n.Class('text-6xl font-bold text-gray-800')], [model.count.toString()]),
      n.View(
        [n.Class('flex-row gap-4')],
        [
          button(n, 'decrement', CounterMessage.ClickedDecrement(), '-'),
          button(n, 'reset', CounterMessage.ClickedReset(), 'Reset'),
          button(n, 'increment', CounterMessage.ClickedIncrement(), '+'),
        ],
      ),
    ],
  )

// The label is an explicit n.Text, so `text-white` lands on the node that renders it.
const button = <M>(n: NativeBuilder<M>, id: string, message: M, label: string): Html =>
  n.Pressable(
    [n.TestId(id), n.OnPress(message), n.Class('bg-black px-4 py-2')],
    [n.Text([n.Class('text-white')], [label])],
  )

export const listView = (model: ListModel, n: NativeBuilder<ListMessage>): Html =>
  n.View(
    [n.Class('flex-1')],
    [
      n.TextInput([
        n.TestId('query'),
        n.Value(model.query),
        n.Placeholder('Filter'),
        n.OnChangeText(value => ListMessage.ChangedQuery({ value })),
      ]),
      n.List({
        items: visibleItems(model),
        key: item => item.id,
        estimatedItemHeight: 56,
        onEndReached: ListMessage.ReachedEnd(),
        attributes: [n.Class('flex-1')],
        row: (item: Item) =>
          n.Pressable(
            [n.TestId(item.id), n.OnPress(ListMessage.ToggledItem({ id: item.id })), n.Class('flex-row p-4 border-b')],
            [n.Text([n.Class(item.done ? 'line-through' : ''), n.NumberOfLines(1)], [item.title])],
          ),
      }),
    ],
  )

// Compile-time guarantees worth reacting to (checked by `pnpm typecheck`):
export const _typeErrors = (n: NativeBuilder<CounterMessage>) => [
  // @ts-expect-error raw string outside n.Text
  n.View([], ['oops']),
  // @ts-expect-error OnChangeText is not a View attribute
  n.View([n.OnChangeText(() => CounterMessage.ClickedReset())]),
  // @ts-expect-error a View is not a valid child of Text
  n.Text([], [n.View([])]),
]

export const run = {
  counter: (model: CounterModel) => counterView(model, makeNativeBuilder<CounterMessage>()),
  list: (model: ListModel) => listView(model, makeNativeBuilder<ListMessage>()),
}
