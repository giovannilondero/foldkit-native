import type { Engine, EngineNode, ResponderEvent } from '@ng-native/fabric'
import type { Module, VNode } from 'foldkit/runtime'

import { asEngineNode } from './domApi.ts'

/**
 * What `n.pressable` puts on its vnode under `data.press`. The press module
 * reads the current vnode's value on every gesture, so a render that hands in
 * a fresh `onPress` closure does not re-register the responder.
 */
export type PressData = Readonly<{
  onPress: () => void
  isDisabled: boolean
}>

/** How far outside its bounds a touch may wander and still press: RN's
 *  `DEFAULT_PRESS_RECT_OFFSETS`. More room below, as a thumb rolls down. */
const PRESS_RETENTION = { top: 20, left: 20, right: 20, bottom: 30 } as const

/** Used only before the first layout, when there are no bounds to compare. */
const PRESS_CANCEL_DISTANCE = 15

type Point = Readonly<{ x: number; y: number }>
type Size = Readonly<{ width: number; height: number }>

const touchPoint = (event: ResponderEvent): Point => {
  const native = (event.nativeEvent ?? {}) as {
    pageX?: number
    pageY?: number
    touches?: ReadonlyArray<{ pageX?: number; pageY?: number }>
  }
  const touch = native.touches?.[0]
  return { x: native.pageX ?? touch?.pageX ?? 0, y: native.pageY ?? touch?.pageY ?? 0 }
}

/** The touch began somewhere inside the control, so the bound is its full
 *  extent plus the retention offset: errs towards keeping the press. */
const isStillOnControl = (size: Size | undefined, dx: number, dy: number): boolean => {
  if (size === undefined) {
    return Math.hypot(dx, dy) <= PRESS_CANCEL_DISTANCE
  }
  const horizontal = dx < 0 ? PRESS_RETENTION.left : PRESS_RETENTION.right
  const vertical = dy < 0 ? PRESS_RETENTION.top : PRESS_RETENTION.bottom
  return Math.abs(dx) <= size.width + horizontal && Math.abs(dy) <= size.height + vertical
}

type Machine = {
  press: PressData
  dispose: () => void
}

const pressOf = (vnode: VNode): PressData | undefined => vnode.data?.press

/**
 * `data.press` → the Engine's responder system: RN's Pressability reduced to
 * grant / move / release / terminate. A press is not a Fabric event; the
 * Engine elects one responder per gesture, so a pressable inside a scroll
 * view yields the drag (`onResponderTerminationRequest`). Size comes from
 * listening to `topLayout`, which is also the opt-in that makes native send
 * it. Long press, press delays, pressed state and Android's `topClick`
 * (TalkBack / D-pad) are not implemented.
 */
export const makePressModule = (engine: Engine): Module => {
  const machines = new WeakMap<EngineNode, Machine>()

  const start = (node: EngineNode, press: PressData): Machine => {
    let origin: Point | undefined
    let size: Size | undefined
    let isCancelled = false

    const machine: Machine = { press, dispose: () => {} }
    const stopResponding = engine.setResponder(node, {
      onStartShouldSetResponder: () => !machine.press.isDisabled,
      onResponderGrant: event => {
        origin = touchPoint(event)
        isCancelled = false
      },
      onResponderMove: event => {
        if (isCancelled || origin === undefined) {
          return
        }
        const point = touchPoint(event)
        // A drag, not a tap: give up the press but stay the responder.
        isCancelled = !isStillOnControl(size, point.x - origin.x, point.y - origin.y)
      },
      onResponderRelease: () => {
        const wasCancelled = isCancelled
        origin = undefined
        isCancelled = false
        if (!wasCancelled && !machine.press.isDisabled) {
          machine.press.onPress()
        }
      },
      onResponderTerminate: () => {
        origin = undefined
        isCancelled = true
      },
      onResponderTerminationRequest: () => true,
    })
    const stopLayout = engine.setEventListener(node, 'topLayout', event => {
      const layout = (event as { nativeEvent?: { layout?: Size } }).nativeEvent?.layout
      if (layout !== undefined) {
        size = { width: layout.width, height: layout.height }
      }
    })
    machine.dispose = () => {
      stopResponding()
      stopLayout()
    }
    return machine
  }

  // NOTE: disposal waits for the end of the patch. Tearing down the responder
  // a finger is still on makes the Engine clear `:active` and commit at once,
  // and a commit in the middle of a patch builds a half-patched tree: native
  // then sees a view appended to a second parent and aborts.
  const disposeAfterPatch: Array<Machine> = []

  const stop = (node: EngineNode): void => {
    const machine = machines.get(node)
    if (machine !== undefined) {
      disposeAfterPatch.push(machine)
      machines.delete(node)
    }
  }

  const updatePress = (_oldVnode: VNode, vnode: VNode): void => {
    if (vnode.elm === undefined) {
      return
    }
    const node = asEngineNode(vnode.elm)
    const press = pressOf(vnode)
    const machine = machines.get(node)
    if (press === undefined) {
      if (machine !== undefined) {
        stop(node)
      }
    } else if (machine === undefined) {
      machines.set(node, start(node, press))
    } else {
      machine.press = press
    }
  }

  return {
    create: updatePress,
    update: updatePress,
    destroy: vnode => {
      if (vnode.elm !== undefined) {
        stop(asEngineNode(vnode.elm))
      }
    },
    post: () => {
      disposeAfterPatch.splice(0).forEach(machine => machine.dispose())
    },
  }
}
