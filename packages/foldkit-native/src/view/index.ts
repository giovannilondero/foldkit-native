import { type Html as FoldkitHtml, type HtmlBuilder } from 'foldkit/html'
import { requireDispatch, type VNode } from 'foldkit/runtime'
import type { TextStyle } from 'react-native'

import type { PressData } from '../platform/press.ts'

/** What a native view returns: a vnode, or nothing. */
export type Html = VNode | null

declare const TextBrand: unique symbol

/** What `n.text` returns. Only it, and raw strings, may sit inside `n.text`,
 *  so "Text strings must be rendered within a <Text>" is a compile error. */
export type TextHtml = VNode & { readonly [TextBrand]: true }

/** RN inline style: camelCase keys, numbers are dp. Text-only keys on a
 *  non-text element are ignored by native, as in React Native. */
export type Style = TextStyle

declare const MessageType: unique symbol

type Dispatch = (message: unknown) => void

type MutableData = {
  key?: string | number
  class?: Record<string, boolean>
  style?: Record<string, unknown>
  props: Record<string, unknown>
  on: Record<string, (event: unknown) => void>
  press?: PressData
  contentContainerStyle?: Record<string, unknown>
}

/**
 * One attribute of a native element. `Tag` decides which elements accept it;
 * `Message` is phantom, so an attribute that dispatches nothing (`Style`) is
 * an `Attribute<'Style', never>` and fits any builder.
 */
export type Attribute<Tag extends string, Message = never> = Readonly<{
  _tag: Tag
  /** Writes the attribute into the vnode data. `dispatch` is bound to the
   *  render frame that builds the element. */
  apply: (data: MutableData, dispatch: () => Dispatch) => void
  readonly [MessageType]?: Message
}>

type CommonTag = 'Key' | 'Class' | 'Style' | 'TestID' | 'AccessibilityLabel'

export type ViewAttribute<Message> = Attribute<CommonTag, Message>
export type TextAttribute<Message> = Attribute<CommonTag | 'NumberOfLines', Message>
export type PressableAttribute<Message> = Attribute<
  CommonTag | 'OnPress' | 'Disabled' | 'AccessibilityRole',
  Message
>
export type ScrollViewAttribute<Message> = Attribute<
  CommonTag | 'ContentContainerStyle' | 'Horizontal',
  Message
>
export type TextInputAttribute<Message> = Attribute<
  CommonTag | 'Value' | 'Placeholder' | 'OnChangeText',
  Message
>

const attribute = <Tag extends string, Message = never>(
  _tag: Tag,
  apply: Attribute<Tag, Message>['apply'],
): Attribute<Tag, Message> => ({ _tag, apply })

const prop = <Tag extends string>(_tag: Tag, key: string, value: unknown): Attribute<Tag> =>
  attribute(_tag, data => {
    data.props[key] = value
  })

const textVNode = (text: string): VNode => ({
  sel: undefined,
  data: undefined,
  children: undefined,
  elm: undefined,
  text,
  key: undefined,
})

const isPresent = (child: Html): child is VNode => child !== null

const element = (
  sel: string,
  attributes: ReadonlyArray<Attribute<string, unknown>>,
  children: ReadonlyArray<VNode>,
  toParent: (message: unknown) => unknown,
  defaults: Readonly<Record<string, unknown>> = {},
): VNode => {
  const data: MutableData = { props: { ...defaults }, on: {} }
  let dispatch: Dispatch | undefined
  // NOTE: read once, while the view runs inside its render frame; handlers
  // fire later, outside it, and close over the result.
  const bound = (): Dispatch => {
    if (dispatch === undefined) {
      const outer = requireDispatch()
      dispatch = message => outer(toParent(message))
    }
    return dispatch
  }
  attributes.forEach(each => each.apply(data, bound))
  return {
    sel,
    // NOTE: snabbdom types `style` as CSS; on native it holds RN style values.
    data: data as VNode['data'],
    children: [...children],
    elm: undefined,
    text: undefined,
    key: data.key,
  }
}

const makeElements = <Message>(toParent: (message: unknown) => unknown) => ({
  // ELEMENTS

  view: (
    attributes: ReadonlyArray<ViewAttribute<Message>>,
    children: ReadonlyArray<Html> = [],
  ): VNode => element('view', attributes, children.filter(isPresent), toParent),

  text: (
    attributes: ReadonlyArray<TextAttribute<Message>>,
    children: ReadonlyArray<string | TextHtml>,
  ): TextHtml =>
    element(
      'text',
      attributes,
      children.map(child => (typeof child === 'string' ? textVNode(child) : child)),
      toParent,
    ) as TextHtml,

  /** A view that runs RN's press protocol through the Engine's responder
   *  system. Accessible and announced as a button by default. */
  pressable: (
    attributes: ReadonlyArray<PressableAttribute<Message>>,
    children: ReadonlyArray<Html> = [],
  ): VNode =>
    element('view', attributes, children.filter(isPresent), toParent, {
      accessible: true,
      focusable: true,
      accessibilityRole: 'button',
    }),

  /** `scroll-view > view[collapsable=false] > children`, as RN's ScrollView
   *  draws it: the inner view is the content container. */
  scrollView: (
    attributes: ReadonlyArray<ScrollViewAttribute<Message>>,
    children: ReadonlyArray<Html> = [],
  ): VNode => {
    const scroll = element('scroll-view', attributes, [], toParent)
    const outer = scroll.data as MutableData
    const content = element('view', [], children.filter(isPresent), toParent, {
      collapsable: false,
    })
    const contentData = content.data as MutableData
    contentData.style = {
      ...(outer.props['horizontal'] === true && { flexDirection: 'row' }),
      ...outer.contentContainerStyle,
    }
    delete outer.contentContainerStyle
    return { ...scroll, children: [content] }
  },

  /** Minimal: rung 2 designs the controlled protocol (`mostRecentEventCount`,
   *  `setTextAndSelection`). Today `Value` writes native `text` as is. */
  textInput: (attributes: ReadonlyArray<TextInputAttribute<Message>>): VNode =>
    element('text-input', attributes, [], toParent, {
      underlineColorAndroid: 'transparent',
    }),

  // ATTRIBUTES

  Key: (value: string | number): Attribute<'Key'> =>
    attribute('Key', data => {
      data.key = value
    }),
  Class: (value: string): Attribute<'Class'> =>
    attribute('Class', data => {
      data.class = Object.fromEntries(
        value
          .split(/\s+/)
          .filter(name => name !== '')
          .map(name => [name, true]),
      )
    }),
  Style: (value: Style): Attribute<'Style'> =>
    attribute('Style', data => {
      data.style = { ...data.style, ...(value as Record<string, unknown>) }
    }),
  TestID: (value: string): Attribute<'TestID'> => prop('TestID', 'testID', value),
  AccessibilityLabel: (value: string): Attribute<'AccessibilityLabel'> =>
    prop('AccessibilityLabel', 'accessibilityLabel', value),
  AccessibilityRole: (value: string): Attribute<'AccessibilityRole'> =>
    prop('AccessibilityRole', 'accessibilityRole', value),
  NumberOfLines: (value: number): Attribute<'NumberOfLines'> =>
    prop('NumberOfLines', 'numberOfLines', value),
  OnPress: (message: Message): Attribute<'OnPress', Message> =>
    attribute('OnPress', (data, dispatch) => {
      const send = dispatch()
      data.press = {
        isDisabled: data.press?.isDisabled ?? false,
        onPress: () => send(message),
      }
    }),
  Disabled: (isDisabled: boolean): Attribute<'Disabled'> =>
    attribute('Disabled', data => {
      data.press = { onPress: data.press?.onPress ?? (() => {}), isDisabled }
      data.props['accessibilityState'] = { disabled: isDisabled }
    }),
  Horizontal: (isHorizontal: boolean): Attribute<'Horizontal'> =>
    prop('Horizontal', 'horizontal', isHorizontal),
  ContentContainerStyle: (value: Style): Attribute<'ContentContainerStyle'> =>
    attribute('ContentContainerStyle', data => {
      data.contentContainerStyle = value as Record<string, unknown>
    }),
  Value: (value: string): Attribute<'Value'> => prop('Value', 'text', value),
  Placeholder: (value: string): Attribute<'Placeholder'> =>
    prop('Placeholder', 'placeholder', value),
  OnChangeText: (toMessage: (text: string) => Message): Attribute<'OnChangeText', Message> =>
    attribute('OnChangeText', (data, dispatch) => {
      const send = dispatch()
      data.on['change'] = event => {
        const text = (event as { nativeEvent?: { text?: string } }).nativeEvent?.text
        send(toMessage(text ?? ''))
      }
    }),

})

/** The typed builder a native view draws with: RN-named elements (camelCase)
 *  and RN-named attributes (PascalCase), Foldkit's attribute-array plus
 *  children-array shape. */
export type NativeBuilder<Message> = ReturnType<typeof makeElements<Message>> &
  Readonly<{
    /** A builder for a child view whose Messages the parent wraps, e.g.
     *  `Counter.view(model.counter, n.map(message => GotCounterMessage({ message })))`. */
    map: <ChildMessage>(f: (message: ChildMessage) => Message) => NativeBuilder<ChildMessage>
  }>

const makeBuilder = <Message>(
  toParent: (message: unknown) => unknown,
): NativeBuilder<Message> => ({
  ...makeElements<Message>(toParent),
  map: <ChildMessage>(f: (message: ChildMessage) => Message) =>
    makeBuilder<ChildMessage>(message => toParent(f(message as ChildMessage))),
})

/** The builder for the app's own Message. */
export const n: NativeBuilder<never> = makeBuilder<never>(message => message)

/**
 * Wires a native view into `makeElement`: `view: nativeView(view)` hands the
 * view `n` in place of Foldkit's HTML builder.
 */
export const nativeView =
  <Model, Message>(view: (model: Model, n: NativeBuilder<Message>) => Html) =>
  (model: Model, _h: HtmlBuilder<Message>): FoldkitHtml =>
    view(model, n as unknown as NativeBuilder<Message>)
