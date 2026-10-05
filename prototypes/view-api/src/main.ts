// PROTOTYPE — throwaway. Renders each variant's counter and long-list views
// as the native tree the Fabric Engine would receive, fires a few events
// through the same dispatch loop Foldkit uses, and re-renders.
//
//   pnpm start            all variants, both demos
//   pnpm start b          one variant
//   pnpm start b list     one variant, one demo

import {
  counterInit,
  counterUpdate,
  listInit,
  listUpdate,
  type CounterMessage,
  type ListMessage,
} from './app'
import * as A from './variantA'
import * as B from './variantB'
import * as C from './variantC'
import { fire, print, setDispatch } from './vnode'

const variants = {
  a: { title: "A — Foldkit's HTML `h`, tags mapped by the Platform", run: A.run },
  b: { title: 'B — NativeBuilder `n`, attribute arrays (Foldkit idiom)', run: B.run },
  c: { title: 'C — NativeBuilder `n`, props records (RN idiom)', run: C.run },
} as const

const [onlyVariant, onlyDemo] = process.argv.slice(2)

for (const [id, variant] of Object.entries(variants)) {
  if (onlyVariant && onlyVariant !== id) continue
  console.log(`\n${'='.repeat(78)}\n${variant.title}\n${'='.repeat(78)}`)

  if (!onlyDemo || onlyDemo === 'counter') {
    let model = counterInit
    setDispatch(message => {
      console.log(`  → dispatched ${(message as CounterMessage)._tag}`)
      model = counterUpdate(model, message as CounterMessage)
    })
    console.log('\n-- counter, initial --\n')
    console.log(print(variant.run.counter(model)))
    const tree = variant.run.counter(model)
    fire(tree, 'increment', 'press')
    fire(tree, 'increment', 'press')
    fire(tree, 'decrement', 'press')
    console.log(`\n-- counter after +,+,- (model ${JSON.stringify(model)}) --\n`)
    console.log(print(variant.run.counter(model)))
  }

  if (!onlyDemo || onlyDemo === 'list') {
    let model = listInit
    setDispatch(message => {
      console.log(`  → dispatched ${(message as ListMessage)._tag} ${JSON.stringify(message)}`)
      model = listUpdate(model, message as ListMessage)
    })
    const started = performance.now()
    const tree = variant.run.list(model)
    const ms = (performance.now() - started).toFixed(1)
    console.log(`\n-- long list, 10 000 items (view built in ${ms} ms) --\n`)
    console.log(print(tree))
    fire(tree, 'item-1', 'press')
    fire(tree, 'query', 'changeText', '99')
    console.log(`\n-- long list after toggling item-1 and typing "99" --\n`)
    console.log(print(variant.run.list(model)))
  }
}
