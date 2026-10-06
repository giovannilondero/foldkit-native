import { type Layer, Option, Schema } from 'effect'
import { mapMessages } from 'foldkit/command'
import { layer as httpLayer } from 'foldkit/http'
import { defineMessageUnion } from 'foldkit/message'
import { makeElement } from 'foldkit/runtime'
import { lift, type Subscriptions } from 'foldkit/subscription'
import type { Return } from 'foldkit/update'
import type { NativeHost } from 'foldkit-native/mount'
import { type Html, type NativeBuilder, nativeView } from 'foldkit-native/view'

import type { Demo, DemoServices } from './demo'
import { type DemoTag, Screen, demos } from './demos'

// The Spike app shell: a menu of demos and a back pressable, no native
// navigation. It routes each demo generically through the `demos` registry,
// so adding a demo never touches this file.

export const Model = Schema.Struct({
  screen: Screen,
  /** Counts demo opens. A demo's Commands carry the visit that ran them, so a
   *  result arriving after back and reopen is told apart from the new one's. */
  visit: Schema.Number,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ClickedDemo: { demo: Schema.String },
  ClickedBack: {},
  /** A Command result from the demo `demo`, opened as visit `visit`. Dropped
   *  unless that visit is still the open one. */
  GotDemoCommandMessage: { demo: Schema.String, visit: Schema.Number, message: Schema.Unknown },
  /** A Message from the demo `demo`'s view or Subscriptions. Both stop when
   *  the demo closes, so the demo's tag being open is enough. */
  GotDemoMessage: { demo: Schema.String, message: Schema.Unknown },
})
export type Message = typeof Message.Type

type UpdateReturn = Return<Model, Message, DemoServices>

// NOTE: the registry's Model and Message types differ per demo; the shell
// only ever pairs a demo with the Model and Messages it produced itself.
type AnyDemo = Demo<unknown, unknown>

const isDemoTag = (tag: string): tag is DemoTag => Object.hasOwn(demos, tag)

const demoOf = (tag: string): AnyDemo | undefined =>
  isDemoTag(tag) ? (demos[tag] as unknown as AnyDemo) : undefined

/** Wraps a demo's Messages from its view and Subscriptions. */
const toDemoMessage =
  (demo: string) =>
  (message: unknown): Message =>
    Message.GotDemoMessage({ demo, message })

const showDemo = (
  tag: string,
  visit: number,
  result: Return<unknown, unknown, DemoServices>,
): UpdateReturn => ({
  model: { screen: { _tag: tag, model: result.model } as Screen, visit },
  commands: mapMessages(result.commands, message =>
    Message.GotDemoCommandMessage({ demo: tag, visit, message }),
  ),
})

const updateOpenDemo = (model: Model, demo: string, demoMessage: unknown): UpdateReturn => {
  const { screen } = model
  const open = demoOf(demo)
  if (screen._tag !== demo || screen._tag === 'Menu' || open === undefined) {
    return { model }
  }
  return showDemo(demo, model.visit, open.update(screen.model, demoMessage))
}

const update = (model: Model, message: Message): UpdateReturn =>
  Message.match(message, {
    ClickedDemo: ({ demo }) => {
      const opened = demoOf(demo)
      return opened === undefined ? { model } : showDemo(demo, model.visit + 1, opened.init())
    },
    ClickedBack: () => ({ model: { ...model, screen: Screen.Menu() } }),
    GotDemoCommandMessage: ({ demo, visit, message: demoMessage }) =>
      visit === model.visit ? updateOpenDemo(model, demo, demoMessage) : { model },
    GotDemoMessage: ({ demo, message: demoMessage }) =>
      updateOpenDemo(model, demo, demoMessage),
  })

const openModel = (model: Model, tag: string): Option.Option<unknown> =>
  model.screen._tag === tag && model.screen._tag !== 'Menu'
    ? Option.some(model.screen.model)
    : Option.none()

/** Every demo's Subscriptions, running only while that demo is open. Keys
 *  are prefixed with the demo tag so two demos never collide. */
const subscriptions: Subscriptions<Model, Message, DemoServices> = Object.fromEntries(
  Object.keys(demos).flatMap(tag => {
    const demoSubscriptions = demoOf(tag)?.subscriptions
    if (demoSubscriptions === undefined) {
      return []
    }
    const lifted = lift(demoSubscriptions)<Model, Message>({
      read: model => openModel(model, tag),
      toParentMessage: toDemoMessage(tag),
    })
    return Object.entries(lifted).map(([key, entry]) => [`${tag}.${key}`, entry])
  }),
)

const menuView = (n: NativeBuilder<Message>): Html =>
  n.view(
    [n.Style({ flex: 1, padding: 24, gap: 12 })],
    [
      n.text([n.Style({ fontSize: 32, fontWeight: '700', marginBottom: 12 })], ['Foldkit Native']),
      ...Object.entries(demos).map(([tag, demo]) =>
        n.pressable(
          [
            n.Key(tag),
            n.TestID(`menu.${tag}`),
            n.OnPress(Message.ClickedDemo({ demo: tag })),
            n.Style({ padding: 16, borderRadius: 8, backgroundColor: '#e5e7eb' }),
          ],
          [n.text([n.Style({ fontSize: 20 })], [demo.title])],
        ),
      ),
    ],
  )

const demoView = (n: NativeBuilder<Message>, tag: string, demoModel: unknown): Html => {
  const open = demoOf(tag)
  return n.view(
    [n.Key(tag), n.Style({ flex: 1 })],
    [
      n.pressable(
        [
          n.TestID('back'),
          n.AccessibilityLabel('Back'),
          n.OnPress(Message.ClickedBack()),
          n.Style({ paddingHorizontal: 24, paddingVertical: 12, alignSelf: 'flex-start' }),
        ],
        [n.text([n.Style({ fontSize: 18, color: '#2563eb' })], [`‹ ${open?.title ?? 'Back'}`])],
      ),
      open?.view(demoModel, n.map(toDemoMessage(tag))) ?? null,
    ],
  )
}

const view = (model: Model, n: NativeBuilder<Message>): Html =>
  n.view(
    // NOTE: no safe-area element yet; a fixed inset clears the status bar.
    [n.Style({ flex: 1, paddingTop: 64, backgroundColor: 'white' })],
    [
      model.screen._tag === 'Menu'
        ? menuView(n)
        : demoView(n, model.screen._tag, model.screen.model),
    ],
  )

/** The Spike app, for `registerApp` (and `mount` in tests). `resources`
 *  provides the demos' services; tests pass stubs. */
export const makeSpike = (
  { container, platform }: NativeHost,
  resources: Layer.Layer<DemoServices> = httpLayer,
) =>
  makeElement({
    Model,
    init: () => ({ model: { screen: Screen.Menu(), visit: 0 } }),
    update,
    view: nativeView(view),
    subscriptions,
    resources,
    container,
    platform,
  })
