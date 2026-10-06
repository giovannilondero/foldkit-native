import { Engine } from '@ng-native/fabric'
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { makeElement, requireDispatch, type VNode } from 'foldkit/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { mount } from '../src/mount.ts'
import { createFakeFabric, manualFrames } from './testing.ts'

// NOTE: React Native's setUpGlobals aliases `window` and `self` to the global
// object, and Foldkit's runtime reads `window.self` at boot. Node has neither.
vi.stubGlobal('window', globalThis)

afterEach(() => {
  vi.restoreAllMocks()
})

// NOTE: raw VNodes, because `n` makes a raw string outside `n.text` a compile
// error. This is what a cast, or a view written with plain snabbdom, does.
const text = (value: string): VNode => ({
  sel: undefined,
  data: undefined,
  children: undefined,
  elm: undefined,
  text: value,
  key: undefined,
})

const h = (
  sel: string,
  data: VNode['data'],
  children: ReadonlyArray<VNode | string>,
): VNode => ({
  sel,
  data,
  children: children.map(child => (typeof child === 'string' ? text(child) : child)),
  elm: undefined,
  text: undefined,
  key: undefined,
})

const Message = defineMessageUnion({ LaidOut: {} })
type Message = typeof Message.Type

const Model = Schema.Struct({ step: Schema.Number })
type Model = typeof Model.Type

/** Each step moves, replaces or drops the loose text around a real `text`. */
const view = (model: Model): VNode => {
  const dispatch = requireDispatch()
  const on = { layout: () => dispatch(Message.LaidOut()) }
  switch (model.step) {
    case 0:
      return h('view', { on }, ['loose before', h('text', {}, ['inside'])])
    case 1:
      return h('view', { on }, [h('text', {}, ['inside']), 'loose after'])
    case 2:
      // A text-only element: snabbdom sets its text content directly.
      return { ...h('view', { on }, []), children: undefined, text: 'loose content' }
    default:
      return h('view', { on }, [h('text', {}, ['inside'])])
  }
}

const setup = () => {
  const fabric = createFakeFabric()
  const engine = new Engine(fabric, 1, { processColor: value => value })
  const frames = manualFrames()
  const app = mount(
    engine,
    ({ container, platform }) =>
      makeElement({
        Model,
        init: () => ({ model: { step: 0 } }),
        update: (model: Model, _message: Message) => ({ model: { step: model.step + 1 } }),
        view,
        container,
        platform,
      }),
    { requestAnimationFrame: frames.requestAnimationFrame },
  )
  const settle = (expected: string) =>
    vi.waitFor(() => {
      frames.flush()
      expect(fabric.render()).toBe(expected)
    })
  const next = () => {
    const appRoot = fabric.committed[0]!.children[0]!
    fabric.emit(appRoot, 'topLayout', { layout: { x: 0, y: 0, width: 1, height: 1 } })
  }
  return { app, settle, next }
}

const withInside = ['View', '  View', '    Paragraph', '      RawText "inside"'].join('\n')

describe('raw text outside a text element', () => {
  it('never reaches Fabric, warns, and leaves the rest of the tree patching normally', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { app, settle, next } = setup()

    await settle(withInside)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('loose before'))

    next()
    await settle(withInside)

    next()
    await settle(['View', '  View'].join('\n'))

    next()
    await settle(withInside)

    app.dispose()
    await settle('')
  })
})
