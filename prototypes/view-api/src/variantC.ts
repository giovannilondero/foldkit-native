// PROTOTYPE — throwaway.
//
// VARIANT C: Native Elements, but props as a typed record instead of an
// attribute array — closer to how React Native code reads, further from
// Foldkit's idiom. Children are a string for Text, an array otherwise.
//
//   n.view({ class: '…' }, [...])   n.pressable({ onPress: Msg }, [...])
//   n.text({ numberOfLines: 1 }, 'Hello')   n.textInput({ value, onChangeText })

import {
  CounterMessage,
  ListMessage,
  visibleItems,
  type CounterModel,
  type ListModel,
} from './app'
import { send, type Html, type VNode } from './vnode'

type Common = Readonly<{ key?: string; class?: string; style?: Record<string, string | number>; testId?: string }>
type PressableProps<M> = Common & Readonly<{ onPress?: M; onLongPress?: M }>
type TextProps<M> = Common & Readonly<{ numberOfLines?: number; onPress?: M }>
type TextInputProps<M> = Common &
  Readonly<{ value: string; placeholder?: string; onChangeText?: (text: string) => M; onSubmitEditing?: M }>

const build = <M>(sel: string, props: Common & Record<string, unknown>, children: ReadonlyArray<VNode | string | null>): VNode => {
  const { key, class: cls, style, testId, ...rest } = props
  const nativeProps: Record<string, unknown> = { ...(testId !== undefined && { testID: testId }) }
  const on: Record<string, (p: unknown) => unknown> = {}
  for (const [name, value] of Object.entries(rest)) {
    if (value === undefined) continue
    if (name.startsWith('on')) {
      const event = name[2]!.toLowerCase() + name.slice(3)
      on[event] = typeof value === 'function' ? p => send((value as (p: unknown) => M)(String(p))) : () => send(value)
    } else nativeProps[name] = value
  }
  return {
    sel,
    data: {
      ...(key !== undefined && { key }),
      ...(cls !== undefined && { class: cls }),
      ...(style !== undefined && { style }),
      props: nativeProps,
      on,
    },
    children: children.filter((c): c is VNode | string => c !== null),
  }
}

const makeNativeBuilder = <M>() => ({
  view: (props: Common, children: ReadonlyArray<Html> = []): Html => build('RCTView', props, children),
  pressable: (props: PressableProps<M>, children: ReadonlyArray<Html> = []): Html => build('RCTView', props, children),
  scrollView: (props: Common, children: ReadonlyArray<Html> = []): Html => build('RCTScrollView', props, children),
  text: (props: TextProps<M>, content: string): Html => build('RCTText', props, [content]),
  textInput: (props: TextInputProps<M>): Html => build('RCTSinglelineTextInputView', props, []),
})
type NativeBuilder<M> = ReturnType<typeof makeNativeBuilder<M>>

// ---------------------------------------------------------------------------
// The views, as an app author would write them.

export const counterView = (model: CounterModel, n: NativeBuilder<CounterMessage>): Html =>
  n.view({ class: 'flex-1 items-center justify-center gap-6 bg-white' }, [
    n.text({ class: 'text-6xl font-bold text-gray-800' }, model.count.toString()),
    n.view({ class: 'flex-row gap-4' }, [
      n.pressable({ testId: 'decrement', onPress: CounterMessage.ClickedDecrement(), class: buttonStyle }, [
        n.text({ class: 'text-white' }, '-'),
      ]),
      n.pressable({ testId: 'reset', onPress: CounterMessage.ClickedReset(), class: buttonStyle }, [
        n.text({ class: 'text-white' }, 'Reset'),
      ]),
      n.pressable({ testId: 'increment', onPress: CounterMessage.ClickedIncrement(), class: buttonStyle }, [
        n.text({ class: 'text-white' }, '+'),
      ]),
    ]),
  ])

const buttonStyle = 'bg-black px-4 py-2'

// No virtual list here: a plain keyed ScrollView, to contrast with variant B.
export const listView = (model: ListModel, n: NativeBuilder<ListMessage>): Html =>
  n.view({ class: 'flex-1' }, [
    n.textInput({
      testId: 'query',
      value: model.query,
      placeholder: 'Filter',
      onChangeText: value => ListMessage.ChangedQuery({ value }),
    }),
    n.scrollView(
      { class: 'flex-1' },
      visibleItems(model).map(item =>
        n.pressable(
          { key: item.id, testId: item.id, onPress: ListMessage.ToggledItem({ id: item.id }), class: 'flex-row p-4 border-b' },
          [n.text({ class: item.done ? 'line-through' : '', numberOfLines: 1 }, item.title)],
        ),
      ),
    ),
  ])

export const run = {
  counter: (model: CounterModel) => counterView(model, makeNativeBuilder<CounterMessage>()),
  list: (model: ListModel) => listView(model, makeNativeBuilder<ListMessage>()),
}
