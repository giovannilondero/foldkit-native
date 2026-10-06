// Compile-time guarantees of the NativeBuilder, checked by `pnpm build` (tsc).
// Never run: building vnodes with handlers needs a render frame.
import { type NativeBuilder } from '../src/view/index.ts'

type Message = { readonly _tag: 'Clicked' }
type OtherMessage = { readonly _tag: 'Other' }

export const typeErrors = (n: NativeBuilder<Message>) => [
  // @ts-expect-error a raw string is only a valid child of n.text
  n.view([], ['oops']),
  // @ts-expect-error a view is not a valid child of n.text
  n.text([], [n.view([])]),
  // @ts-expect-error OnPress belongs to n.pressable
  n.view([n.OnPress({ _tag: 'Clicked' })]),
  // @ts-expect-error a Message from another universe
  n.pressable([(n as unknown as NativeBuilder<OtherMessage>).OnPress({ _tag: 'Other' })]),
  // @ts-expect-error Style is typed RN style
  n.view([n.Style({ flex: 'one' })]),
  n.text([], ['ok', n.text([], ['nested'])]),
]
