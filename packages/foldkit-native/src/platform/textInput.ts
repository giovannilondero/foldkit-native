import type { Engine, EngineNode } from '@ng-native/fabric'
import type { Module, VNode } from 'foldkit/runtime'

import { asEngineNode } from './domApi.ts'

/**
 * What `n.textInput` puts on its vnode under `data.textInput`: the Model's
 * text, and what to do with the text native reports. The module reads the
 * current vnode's value, so fresh closures per render cost nothing.
 */
export type TextInputData = Readonly<{
  value: string | undefined
  onChangeText: ((text: string) => void) | undefined
}>

/** `setTextAndSelection`'s selection arguments for "leave the cursor be". */
const KEEP_SELECTION = -1

type Field = {
  input: TextInputData
  /** What native showed last, by its own report or by our command. */
  lastNativeText: string | undefined
  /** The `eventCount` of the last `topChange`: native's edit counter. */
  eventCount: number
  /** The `mostRecentEventCount` prop as last written. */
  writtenEventCount: number | undefined
  dispose: () => void
}

export type TextInputModuleOptions = Readonly<{
  /** Runs `callback` once the current render frame has committed. */
  afterCommit: (callback: () => void) => void
  /** Runs `callback` on a later animation frame, after any render frame a
   *  Message dispatched right now has scheduled. */
  requestAnimationFrame: (callback: () => void) => void
}>

/**
 * The controlled text input protocol: React Native's, driven from the
 * Model instead of component state.
 *
 * - Native edits first and reports `topChange { text, eventCount }`. The
 *   module records both, then hands `text` to `onChangeText`.
 * - Every render writes `text` (the Model's value) and
 *   `mostRecentEventCount` (the last `eventCount` seen) as props.
 * - When the Model's value differs from what native last showed (a
 *   transform such as uppercase, a rejected edit, a reset), the module sends
 *   `setTextAndSelection(eventCount, value, -1, -1)` after the commit, then
 *   remeasures. Native drops the command if the user has typed since
 *   `eventCount` (iOS: count must match; Android: count must not be older), so
 *   a frame that lags fast typing never overwrites keystrokes: the newer
 *   `topChange` is already on its way, and the next render answers it.
 * - The cursor is left where native has it: -1/-1 keeps the selection, and
 *   both platforms keep the caret's offset from the end across the swap.
 *
 * An update that keeps the Model's reference renders nothing, so the
 * module also checks once an animation frame after each change: if the
 * field still disagrees with the last rendered value, the same command
 * reverts the edit.
 */
export const makeTextInputModule = (
  engine: Engine,
  options: TextInputModuleOptions,
): Module => {
  const fields = new WeakMap<EngineNode, Field>()

  /** Sends the Model's value to native if native shows something else. */
  const reconcile = (node: EngineNode, field: Field): void => {
    const desired = field.input.value
    if (desired === undefined || field.lastNativeText === desired) {
      return
    }
    field.lastNativeText = desired
    engine.dispatchCommand(node, 'setTextAndSelection', [
      field.eventCount,
      desired,
      KEEP_SELECTION,
      KEEP_SELECTION,
    ])
    // NOTE: a text input is measured from native state, which the command
    // changes after the commit that carried the text: commit it again.
    engine.remeasure(node)
  }

  const start = (node: EngineNode, input: TextInputData): Field => {
    const field: Field = {
      input,
      lastNativeText: input.value,
      eventCount: 0,
      writtenEventCount: undefined,
      dispose: () => {},
    }
    field.dispose = engine.setEventListener(node, 'topChange', event => {
      const native = (event as { nativeEvent?: { text?: string; eventCount?: number } })
        .nativeEvent
      const text = native?.text ?? ''
      field.lastNativeText = text
      field.eventCount = native?.eventCount ?? field.eventCount + 1
      field.input.onChangeText?.(text)
      options.requestAnimationFrame(() => {
        if (fields.get(node) === field) {
          reconcile(node, field)
        }
      })
    })
    return field
  }

  const updateField = (_oldVnode: VNode, vnode: VNode): void => {
    if (vnode.elm === undefined) {
      return
    }
    const node = asEngineNode(vnode.elm)
    const input: TextInputData | undefined = vnode.data?.textInput
    const existing = fields.get(node)
    if (input === undefined) {
      if (existing !== undefined) {
        existing.dispose()
        fields.delete(node)
      }
      return
    }
    const field = existing ?? start(node, input)
    fields.set(node, field)
    const oldValue = existing === undefined ? undefined : field.input.value
    field.input = input
    if (existing === undefined || oldValue !== input.value) {
      engine.setProp(node, 'text', input.value ?? null)
    }
    if (field.writtenEventCount !== field.eventCount) {
      field.writtenEventCount = field.eventCount
      engine.setProp(node, 'mostRecentEventCount', field.eventCount)
    }
    options.afterCommit(() => reconcile(node, field))
  }

  return {
    create: updateField,
    update: updateField,
    destroy: vnode => {
      if (vnode.elm === undefined) {
        return
      }
      const node = asEngineNode(vnode.elm)
      fields.get(node)?.dispose()
      fields.delete(node)
    },
  }
}
