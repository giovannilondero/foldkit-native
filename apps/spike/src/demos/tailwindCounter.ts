import type { Html, NativeBuilder } from 'foldkit-native/view'

import { defineDemo } from '../demo'
import * as Counter from './counter'

// Rung 6: the rung 1 Counter, styled by Tailwind classes instead of inline
// Style. Same Model, Messages and update; only the view differs.

export const Model = Counter.Model
export type Model = Counter.Model
type Message = Counter.Message
const { Message } = Counter

// NOTE: class strings are whole literals so Tailwind's scan finds them.
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
      n.Class('min-w-16 items-center rounded-lg bg-indigo-600 px-4 py-3 active:bg-indigo-800'),
    ],
    [n.text([n.Class('text-xl font-semibold text-white')], [label])],
  )

const view = (model: Model, n: NativeBuilder<Message>): Html =>
  n.view(
    [
      n.TestID('tailwind.screen'),
      n.Class('flex-1 items-center justify-center gap-6 bg-white dark:bg-slate-900'),
    ],
    [
      n.text(
        [
          n.TestID('tailwind.count'),
          n.Class('text-5xl font-bold text-slate-900 dark:text-white'),
        ],
        [`Count: ${model.count}`],
      ),
      n.view(
        [n.Class('flex-row gap-3')],
        [
          button(n, 'tailwind.decrement', Message.ClickedDecrement(), '-'),
          button(n, 'tailwind.reset', Message.ClickedReset(), 'Reset'),
          button(n, 'tailwind.increment', Message.ClickedIncrement(), '+'),
        ],
      ),
    ],
  )

export const demo = defineDemo<Model, Message>({
  ...Counter.demo,
  title: 'Counter (Tailwind)',
  view,
})
