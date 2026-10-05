// PROTOTYPE — throwaway.
//
// VARIANT A: keep Foldkit's HtmlBuilder `h` exactly as it is. The view writes
// HTML; the Fabric Platform maps each HTML tag onto a Native Element.
//
//   div/section/ul/li  → RCTView
//   p/span/h1/label    → RCTText (RCTVirtualText when nested in text)
//   button             → RCTView + press protocol
//   input              → RCTSinglelineTextInputView
//   (no HTML tag means "scroll view" → Foldkit's customElement escape hatch)
//
// Raw strings outside a text tag are auto-wrapped in an RCTText by the
// Platform, because RN rejects them otherwise.

import { Data } from 'effect'
import {
  CounterMessage,
  ListMessage,
  visibleItems,
  type CounterModel,
  type ListModel,
} from './app'
import { send, type Html, type VNode } from './vnode'

// A small slice of Foldkit's real Attribute TaggedEnum, same names and shapes.
type Attribute<Message> = Data.TaggedEnum<{
  Key: { readonly value: string }
  Class: { readonly value: string }
  Id: { readonly value: string }
  Style: { readonly value: Record<string, string> }
  Value: { readonly value: string }
  Placeholder: { readonly value: string }
  OnClick: { readonly message: Message }
  OnInput: { readonly f: (value: string) => Message }
}>
type Child = Html | string

const TAG_TO_NATIVE: Record<string, string> = {
  div: 'RCTView', section: 'RCTView', ul: 'RCTView', li: 'RCTView',
  p: 'RCTText', span: 'RCTText', h1: 'RCTText', label: 'RCTText',
  button: 'RCTView', input: 'RCTSinglelineTextInputView',
  'scroll-view': 'RCTScrollView',
}
const isText = (sel: string) => sel === 'RCTText' || sel === 'RCTVirtualText'

const element =
  (tag: string) =>
  <Message>(attributes: ReadonlyArray<Attribute<Message>>, children: ReadonlyArray<Child> = []): Html => {
    const sel = TAG_TO_NATIVE[tag] ?? 'RCTView'
    const data: VNode['data'] & { props: Record<string, unknown>; on: Record<string, (p: unknown) => unknown> } = {
      htmlTag: tag,
      props: {},
      on: {},
    }
    for (const attribute of attributes) {
      switch (attribute._tag) {
        case 'Key': data.key = attribute.value; break
        case 'Class': data.class = attribute.value; break
        case 'Id': data.props.testID = attribute.value; break
        case 'Style': data.style = attribute.value; break // CSS strings: Platform must convert '12px' → 12
        case 'Value': data.props.value = attribute.value; break
        case 'Placeholder': data.props.placeholder = attribute.value; break
        // OnClick means "click" in the DOM; here the Platform reinterprets it as press.
        case 'OnClick': { const m = attribute.message; data.on.press = () => send(m); break }
        case 'OnInput': { const f = attribute.f; data.on.changeText = t => send(f(String(t))); break }
      }
    }
    const nativeChildren = children.flatMap((child): ReadonlyArray<VNode | string> => {
      if (child === null) return []
      if (typeof child === 'string') {
        // Platform auto-wraps: a hidden Text the author never wrote and can't style.
        return isText(sel) ? [child] : [{ sel: 'RCTText', data: { htmlTag: '(auto-wrapped)' }, children: [child] }]
      }
      return isText(sel) && child.sel === 'RCTText' ? [{ ...child, sel: 'RCTVirtualText' }] : [child]
    })
    return { sel, data, children: nativeChildren }
  }

const A = Data.taggedEnum<Attribute<any>>()

// What a view receives: Foldkit's `h`, unchanged in shape.
const makeHtmlBuilder = <Message>() => ({
  div: element('div')<Message>,
  ul: element('ul')<Message>,
  li: element('li')<Message>,
  p: element('p')<Message>,
  span: element('span')<Message>,
  h1: element('h1')<Message>,
  button: element('button')<Message>,
  input: (attributes: ReadonlyArray<Attribute<Message>>) => element('input')<Message>(attributes),
  scrollView: element('scroll-view')<Message>, // stands in for h.customElement('scroll-view')
  keyed: (tag: 'li' | 'div') => (key: string, attributes: ReadonlyArray<Attribute<Message>>, children: ReadonlyArray<Child>) =>
    element(tag)<Message>([...attributes, A.Key({ value: key })], children),
  Class: (value: string): Attribute<Message> => A.Class({ value }),
  Id: (value: string): Attribute<Message> => A.Id({ value }),
  Style: (value: Record<string, string>): Attribute<Message> => A.Style({ value }),
  Value: (value: string): Attribute<Message> => A.Value({ value }),
  Placeholder: (value: string): Attribute<Message> => A.Placeholder({ value }),
  OnClick: (message: Message): Attribute<Message> => A.OnClick({ message }),
  OnInput: (f: (value: string) => Message): Attribute<Message> => A.OnInput({ f }),
})
type HtmlBuilder<Message> = ReturnType<typeof makeHtmlBuilder<Message>>

// ---------------------------------------------------------------------------
// The views, as an app author would write them.

export const counterView = (model: CounterModel, h: HtmlBuilder<CounterMessage>): Html =>
  h.div(
    [h.Class('flex-1 items-center justify-center gap-6 bg-white')],
    [
      h.p([h.Class('text-6xl font-bold text-gray-800')], [model.count.toString()]),
      h.div(
        [h.Class('flex-row gap-4')],
        [
          h.button([h.Id('decrement'), h.OnClick(CounterMessage.ClickedDecrement()), h.Class(buttonStyle)], ['-']),
          h.button([h.Id('reset'), h.OnClick(CounterMessage.ClickedReset()), h.Class(buttonStyle)], ['Reset']),
          h.button([h.Id('increment'), h.OnClick(CounterMessage.ClickedIncrement()), h.Class(buttonStyle)], ['+']),
        ],
      ),
    ],
  )

// `text-white` sits on the button (an RCTView). RN does not inherit text style
// from a View, so unless the CSS runtime propagates it, the auto-wrapped "+"
// stays black.
const buttonStyle = 'bg-black text-white px-4 py-2'

export const listView = (model: ListModel, h: HtmlBuilder<ListMessage>): Html =>
  h.div(
    [h.Class('flex-1')],
    [
      h.input([h.Id('query'), h.Value(model.query), h.Placeholder('Filter'), h.OnInput(value => ListMessage.ChangedQuery({ value }))]),
      h.scrollView(
        [h.Class('flex-1')],
        visibleItems(model).map(item =>
          h.keyed('li')(
            item.id,
            [h.Id(item.id), h.OnClick(ListMessage.ToggledItem({ id: item.id })), h.Class('flex-row p-4 border-b')],
            [h.span([h.Class(item.done ? 'line-through' : '')], [item.title])],
          ),
        ),
      ),
    ],
  )

export const run = {
  counter: (model: CounterModel) => counterView(model, makeHtmlBuilder<CounterMessage>()),
  list: (model: ListModel) => listView(model, makeHtmlBuilder<ListMessage>()),
}
