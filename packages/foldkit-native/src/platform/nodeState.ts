import type { EngineNode } from '@ng-native/fabric'
import type { Module, VNode } from 'foldkit/runtime'

import { engineNodeOf } from './domApi.ts'

/** What a module keeps for one Engine node: the vnode data it last saw, and
 *  how to release what it registered with the Engine. */
export type NodeState<Input> = {
  input: Input
  dispose: () => void
}

export type NodeStateOptions<Input, State extends NodeState<Input>> = Readonly<{
  /** The part of a vnode's data the module serves; `undefined` when the
   *  vnode asks for nothing, which stops any state the node had. */
  inputOf: (vnode: VNode) => Input | undefined
  /** Registers with the Engine for a node that just started asking. */
  start: (node: EngineNode, input: Input, vnode: VNode) => State
  /** Runs on every create and update that has input, once `state.input` holds
   *  the new input. `previousInput` is `undefined` right after `start`. */
  onPatch?: (
    node: EngineNode,
    state: State,
    previousInput: Input | undefined,
    vnode: VNode,
  ) => void
  /** How stopped state is released. Defaults to `state.dispose()` at once. */
  release?: (state: State) => void
}>

/**
 * The create / update / destroy hooks of a module that keeps state per Engine
 * node (listeners, a responder, a text field) and reads the current vnode's
 * data on every event, so a render that hands in fresh closures does not
 * re-register anything.
 */
export const makeNodeStateHooks = <Input, State extends NodeState<Input>>(
  options: NodeStateOptions<Input, State>,
): Pick<Module, 'create' | 'update' | 'destroy'> => {
  const states = new WeakMap<EngineNode, State>()
  const release = options.release ?? (state => state.dispose())

  const stop = (node: EngineNode): void => {
    const state = states.get(node)
    if (state !== undefined) {
      states.delete(node)
      release(state)
    }
  }

  const patch = (_oldVnode: VNode, vnode: VNode): void => {
    const node = engineNodeOf(vnode)
    if (node === undefined) {
      return
    }
    const input = options.inputOf(vnode)
    if (input === undefined) {
      stop(node)
      return
    }
    const existing = states.get(node)
    const state = existing ?? options.start(node, input, vnode)
    const previousInput = existing === undefined ? undefined : existing.input
    state.input = input
    states.set(node, state)
    options.onPatch?.(node, state, previousInput, vnode)
  }

  return {
    create: patch,
    update: patch,
    destroy: vnode => {
      const node = engineNodeOf(vnode)
      if (node !== undefined) {
        stop(node)
      }
    },
  }
}
