import type { Engine } from '@ng-native/fabric'
import type { Module, VNode } from 'foldkit/runtime'

import { engineNodeOf } from './domApi.ts'
import { makeNodeStateHooks, type NodeState } from './nodeState.ts'

// NOTE: no module sets `dataMask`. Foldkit's VNodeDataMask bits are internal,
// and a module without a mask simply runs for every vnode, which is correct.
// Revisit if patch cost shows up in a profile.

/** A string-keyed record read off vnode data: props, a style, classes. */
type Values = Readonly<Record<string, unknown>>

const NO_VALUES: Values = {}

/** The props a vnode asks for: snabbdom's `attrs` and `props` are one thing
 *  on native, so they are merged, `props` winning. */
const propsOf = (vnode: VNode): Values => {
  const data = vnode.data
  if (data === undefined || (data.attrs === undefined && data.props === undefined)) {
    return NO_VALUES
  }
  return { ...data.attrs, ...data.props }
}

/** attrs + props → `engine.setProp`, with removal as `setProp(node, key, null)`. */
export const makePropsModule = (engine: Engine): Module => {
  const updateProps = (oldVnode: VNode, vnode: VNode): void => {
    const node = engineNodeOf(vnode)
    const oldProps = propsOf(oldVnode)
    const props = propsOf(vnode)
    if (node === undefined || oldProps === props) {
      return
    }
    for (const key of Object.keys(oldProps)) {
      if (!(key in props)) {
        engine.setProp(node, key, null)
      }
    }
    for (const [key, value] of Object.entries(props)) {
      if (oldProps[key] !== value) {
        engine.setProp(node, key, value)
      }
    }
  }
  return { create: updateProps, update: updateProps }
}

const classNameOf = (vnode: VNode): string =>
  Object.entries(vnode.data?.class ?? NO_VALUES)
    .filter(([, isOn]) => isOn === true)
    .map(([name]) => name)
    .join(' ')

/** class → `engine.setClasses`. Classes only feed the Engine's CSS cascade. */
export const makeClassModule = (engine: Engine): Module => {
  const updateClasses = (oldVnode: VNode, vnode: VNode): void => {
    const node = engineNodeOf(vnode)
    const className = classNameOf(vnode)
    if (node !== undefined && className !== classNameOf(oldVnode)) {
      engine.setClasses(node, className)
    }
  }
  return { create: updateClasses, update: updateClasses }
}

// NOTE: snabbdom's `delayed`, `remove` and `destroy` style hooks animate DOM
// removal; the Engine's own transitions replace them, so they are dropped.
const SNABBDOM_STYLE_HOOKS = new Set(['delayed', 'remove', 'destroy'])

const styleOf = (vnode: VNode): Values | undefined => {
  const style = vnode.data?.style
  if (style === undefined) {
    return undefined
  }
  return Object.fromEntries(
    Object.entries(style).filter(([key]) => !SNABBDOM_STYLE_HOOKS.has(key)),
  )
}

const isShallowEqual = (a: Values | undefined, b: Values | undefined): boolean => {
  if (a === undefined || b === undefined) {
    return a === b
  }
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length && keys.every(key => a[key] === b[key])
  )
}

/** style → `engine.setProp(node, 'style', …)`. Values are RN style values. */
export const makeStyleModule = (engine: Engine): Module => {
  const updateStyle = (oldVnode: VNode, vnode: VNode): void => {
    const node = engineNodeOf(vnode)
    const style = styleOf(vnode)
    if (node !== undefined && !isShallowEqual(styleOf(oldVnode), style)) {
      engine.setProp(node, 'style', style ?? null)
    }
  }
  return { create: updateStyle, update: updateStyle }
}

/**
 * The Fabric event a snabbdom `on` key listens to: `layout` → `topLayout`,
 * `change` → `topChange`. A key already spelled as a Fabric event
 * (`topScroll`) passes through.
 */
export const topLevelTypeOf = (name: string): string =>
  /^top[A-Z]/.test(name)
    ? name
    : `top${name.charAt(0).toUpperCase()}${name.slice(1)}`

type Listener = (this: VNode, event: unknown, vnode: VNode) => void

type On = NonNullable<NonNullable<VNode['data']>['on']>

const invokeHandler = (
  handler: Listener | ReadonlyArray<Listener> | undefined,
  vnode: VNode,
  event: unknown,
): void => {
  if (typeof handler === 'function') {
    handler.call(vnode, event, vnode)
  } else if (Array.isArray(handler)) {
    handler.forEach(each => invokeHandler(each, vnode, event))
  }
}

type Subscription = NodeState<On> & {
  /** The vnode currently patched onto the node; its handler is read per event. */
  vnode: VNode
  disposers: Map<string, () => void>
}

/**
 * on → `engine.setEventListener`. One Engine listener per node and event
 * name, which looks up the current vnode's handler when the event fires, so a
 * render that hands in fresh handler closures does not re-subscribe.
 * Listeners receive the Engine's `NativeSyntheticEvent` (`{ nativeEvent,
 * target, stopPropagation }`); there is no `event.type`.
 */
export const makeEventsModule = (engine: Engine): Module =>
  makeNodeStateHooks<On, Subscription>({
    inputOf: vnode => {
      const on = vnode.data?.on
      return on === undefined || Object.keys(on).length === 0 ? undefined : on
    },
    start: (_node, on, vnode) => {
      const subscription: Subscription = {
        input: on,
        vnode,
        disposers: new Map(),
        dispose: () => {
          subscription.disposers.forEach(dispose => dispose())
          subscription.disposers.clear()
        },
      }
      return subscription
    },
    onPatch: (node, subscription, _previousOn, vnode) => {
      subscription.vnode = vnode
      const on = subscription.input
      for (const [name, dispose] of subscription.disposers) {
        if (!(name in on)) {
          dispose()
          subscription.disposers.delete(name)
        }
      }
      for (const name of Object.keys(on)) {
        if (!subscription.disposers.has(name)) {
          subscription.disposers.set(
            name,
            engine.setEventListener(node, topLevelTypeOf(name), event => {
              const current = subscription.vnode
              invokeHandler(current.data?.on?.[name], current, event)
            }),
          )
        }
      }
    },
  })

/** Frees what the Engine holds for a destroyed element: listeners,
 *  animations, focus. It does not detach the node; snabbdom removes it after
 *  every destroy hook has run. */
export const makeDestroyModule = (engine: Engine): Module => ({
  destroy: vnode => {
    const node = engineNodeOf(vnode)
    if (node !== undefined) {
      engine.destroyNode(node)
    }
  },
})
