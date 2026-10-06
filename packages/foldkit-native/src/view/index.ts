import { type Html as FoldkitHtml, type HtmlBuilder } from 'foldkit/html'
import { requireDispatch, type VNode } from 'foldkit/runtime'
import type { TextStyle } from 'react-native'

import type { PressData } from '../platform/press.ts'
import type { TextInputData } from '../platform/textInput.ts'

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

/** The vnode data an element's attributes write into, before it becomes the
 *  vnode's `data`. */
type VNodeDataDraft = {
  key?: string | number
  class?: Record<string, boolean>
  style?: Record<string, unknown>
  props: Record<string, unknown>
  on: Record<string, (event: unknown) => void>
  /** Set by `OnPress`; with `isPressDisabled`, becomes `press`. */
  onPress?: () => void
  /** Set by `Disabled`. */
  isPressDisabled?: boolean
  press?: PressData
  textInput?: TextInputData
}

/**
 * One attribute of a Native Element. `Name` decides which Native Elements
 * accept it; `Message` is phantom, so an attribute that dispatches nothing
 * (`Style`) is an `Attribute<'Style', never>` and fits any builder.
 */
export type Attribute<Name extends string, Message = never> = Readonly<{
  _tag: Name
  /** Writes the attribute into the vnode data. `dispatch` is bound to the
   *  render frame that builds the element. */
  apply: (data: VNodeDataDraft, dispatch: () => Dispatch) => void
  readonly [MessageType]?: Message
}>

/** The attributes every Native Element accepts. */
type CommonAttributeName = 'Key' | 'Class' | 'Style' | 'TestID' | 'AccessibilityLabel'

export type ViewAttribute<Message> = Attribute<CommonAttributeName, Message>
export type TextAttribute<Message> = Attribute<CommonAttributeName, Message>
export type PressableAttribute<Message> = Attribute<
  CommonAttributeName | 'OnPress' | 'Disabled',
  Message
>
export type ScrollViewAttribute<Message> = Attribute<CommonAttributeName, Message>
export type TextInputAttribute<Message> = Attribute<
  | CommonAttributeName
  | 'Value'
  | 'Placeholder'
  | 'OnChangeText'
  | 'AutoCorrect'
  | 'AutoCapitalize',
  Message
>

const attribute = <Name extends string, Message = never>(
  _tag: Name,
  apply: Attribute<Name, Message>['apply'],
): Attribute<Name, Message> => ({ _tag, apply })

const prop = <Name extends string>(_tag: Name, key: string, value: unknown): Attribute<Name> =>
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
  const draft: VNodeDataDraft = { props: { ...defaults }, on: {} }
  let dispatch: Dispatch | undefined
  // NOTE: read once, while the view runs inside its render frame; handlers
  // fire later, outside it, and close over the result.
  const resolveDispatch = (): Dispatch => {
    if (dispatch === undefined) {
      const outer = requireDispatch()
      dispatch = message => outer(toParent(message))
    }
    return dispatch
  }
  attributes.forEach(each => each.apply(draft, resolveDispatch))
  // NOTE: only an element with `OnPress` takes part in the press protocol. A
  // `Disabled` alone must not make it a responder that swallows touches.
  if (draft.onPress !== undefined) {
    draft.press = { onPress: draft.onPress, isDisabled: draft.isPressDisabled ?? false }
  }
  delete draft.onPress
  delete draft.isPressDisabled
  return {
    sel,
    // NOTE: snabbdom types `style` as CSS; on native it holds RN style values.
    data: draft as VNode['data'],
    children: [...children],
    elm: undefined,
    text: undefined,
    key: draft.key,
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
   *  draws it: the inner view is the content container. Vertical only. */
  scrollView: (
    attributes: ReadonlyArray<ScrollViewAttribute<Message>>,
    children: ReadonlyArray<Html> = [],
  ): VNode =>
    element(
      'scroll-view',
      attributes,
      [
        element('view', [], children.filter(isPresent), toParent, {
          collapsable: false,
        }),
      ],
      toParent,
    ),

  /** A controlled field: `Value` is the Model's text, `OnChangeText` gets
   *  what native shows after each edit. The text input module keeps the two
   *  in step with RN's event-count protocol (`platform/textInput.ts`). */
  textInput: (attributes: ReadonlyArray<TextInputAttribute<Message>>): VNode => {
    const vnode = element('text-input', attributes, [], toParent, {
      underlineColorAndroid: 'transparent',
    })
    const data = vnode.data as VNodeDataDraft
    data.textInput ??= { value: undefined, onChangeText: undefined }
    return vnode
  },

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
  OnPress: (message: Message): Attribute<'OnPress', Message> =>
    attribute('OnPress', (data, dispatch) => {
      const send = dispatch()
      data.onPress = () => send(message)
    }),
  Disabled: (isDisabled: boolean): Attribute<'Disabled'> =>
    attribute('Disabled', data => {
      data.isPressDisabled = isDisabled
      data.props['accessibilityState'] = { disabled: isDisabled }
    }),
  Value: (value: string): Attribute<'Value'> =>
    attribute('Value', data => {
      data.textInput = { onChangeText: data.textInput?.onChangeText, value }
    }),
  /** Off for a field whose Model rewrites the text: iOS's autocorrect and
   *  predictions fight a rewrite under them and scramble fast typing. */
  AutoCorrect: (isOn: boolean): Attribute<'AutoCorrect'> =>
    attribute('AutoCorrect', data => {
      data.props['autoCorrect'] = isOn
      data.props['spellCheck'] = isOn
    }),
  AutoCapitalize: (
    value: 'none' | 'sentences' | 'words' | 'characters',
  ): Attribute<'AutoCapitalize'> => prop('AutoCapitalize', 'autoCapitalize', value),
  Placeholder: (value: string): Attribute<'Placeholder'> =>
    prop('Placeholder', 'placeholder', value),
  OnChangeText: (toMessage: (text: string) => Message): Attribute<'OnChangeText', Message> =>
    attribute('OnChangeText', (data, dispatch) => {
      const send = dispatch()
      data.textInput = {
        value: data.textInput?.value,
        onChangeText: text => send(toMessage(text)),
      }
    }),
})

/** The typed builder a native view draws with: RN-named Native Elements
 *  (camelCase) and RN-named attributes (PascalCase), Foldkit's
 *  attribute-array plus children-array shape. */
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
