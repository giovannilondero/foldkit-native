import type { HttpClient } from 'effect/http'
import type { Subscriptions } from 'foldkit/subscription'
import type { Return } from 'foldkit/update'
import type { Html, NativeBuilder } from 'foldkit-native/view'

/** Services a demo's Commands and Subscriptions may need. The app's
 *  `resources` Layer (in `app.ts`) must provide every one listed here. */
export type DemoServices = HttpClient.HttpClient

/**
 * One screen of the Spike app, a self-contained Foldkit program the menu
 * opens. The app routes its Messages, Commands and Subscriptions while the
 * demo is open and drops its Model on back, so re-opening starts afresh.
 */
export type Demo<Model, Message> = Readonly<{
  /** The menu entry. */
  title: string
  init: () => Return<Model, Message, DemoServices>
  update: (model: Model, message: Message) => Return<Model, Message, DemoServices>
  view: (model: Model, n: NativeBuilder<Message>) => Html
  /** Run only while the demo is open. */
  subscriptions?: Subscriptions<Model, Message, DemoServices>
}>

/** Infers a demo's Model and Message from its functions. */
export const defineDemo = <Model, Message>(demo: Demo<Model, Message>): Demo<Model, Message> =>
  demo
