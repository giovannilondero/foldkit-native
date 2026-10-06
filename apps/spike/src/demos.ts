import { defineTaggedUnion } from 'foldkit/schema'

import type { Demo } from './demo'
import * as Counter from './demos/counter'
import * as Http from './demos/http'

// Adding a demo: write `demos/<name>.ts` exporting `Model` and `demo`, then
// add one line to `Screen` and one to `demos` below. Nothing else changes.

/** What the app shows: the menu, or one open demo holding its own Model. */
export const Screen = defineTaggedUnion({
  Menu: {},
  Counter: { model: Counter.Model },
  Http: { model: Http.Model },
})
export type Screen = typeof Screen.Type

/** The menu, in order. Keys are the `Screen` tags. */
export const demos = {
  Counter: Counter.demo,
  Http: Http.demo,
} satisfies DemoRegistry

export type DemoTag = keyof typeof demos

type OpenScreen = Exclude<Screen, { _tag: 'Menu' }>

// Keeps `Screen` and `demos` in step: every demo tag has exactly one entry,
// whose Model is the one its `Screen` variant holds.
type DemoRegistry = {
  readonly [Tag in OpenScreen['_tag']]: Demo<
    Extract<OpenScreen, { _tag: Tag }>['model'],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >
}
