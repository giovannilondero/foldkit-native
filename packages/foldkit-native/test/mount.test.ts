import { Engine } from '@ng-native/fabric'
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { makeElement, requireDispatch, type VNode } from 'foldkit/runtime'
import { describe, expect, it, vi } from 'vitest'

import { mount } from '../src/mount.ts'
import { createFakeFabric, manualFrames } from './testing.ts'

// NOTE: React Native's setUpGlobals aliases `window` and `self` to the global
// object, and Foldkit's runtime reads `window.self` at boot. Node has neither.
vi.stubGlobal('window', globalThis)

// NOTE: raw VNodes stand in for the NativeBuilder `n`, which comes later.
const h = (
  sel: string,
  data: VNode['data'],
  children: ReadonlyArray<VNode | string>,
): VNode => ({
  sel,
  data,
  children: children.map(child =>
    typeof child === 'string'
      ? { sel: undefined, data: undefined, children: undefined, elm: undefined, text: child, key: undefined }
      : child,
  ),
  elm: undefined,
  text: undefined,
  key: undefined,
})

const Message = defineMessageUnion({
  LaidOut: {},
})
type Message = typeof Message.Type

const Model = Schema.Struct({ count: Schema.Number })
type Model = typeof Model.Type

const view = (model: Model): VNode => {
  const dispatch = requireDispatch()
  return h('view', { on: { layout: () => dispatch(Message.LaidOut()) } }, [
    h('text', {}, [`count:${model.count}`]),
    ...(model.count === 0 ? [h('view', { style: { backgroundColor: 'red' } }, [])] : []),
  ])
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
        init: () => ({ model: { count: 0 } }),
        update: (model: Model, _message: Message) => ({
          model: { count: model.count + 1 },
        }),
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
  return { fabric, frames, app, settle }
}

describe('mount', () => {
  it('commits the initial view inside a full-height host view', async () => {
    const { fabric, app, settle } = setup()

    await settle(
      ['View', '  View', '    Paragraph', '      RawText "count:0"', '    View'].join('\n'),
    )
    expect(fabric.committed[0]?.props).toMatchObject({ height: '100%' })
    // Inline style reaches Fabric flattened into the node's props.
    expect(fabric.committed[0]?.children[0]?.children[1]?.props).toMatchObject({
      backgroundColor: 'red',
    })
    app.dispose()
  })

  it('patches the committed tree in one commit when a Fabric event dispatches a Message', async () => {
    const { fabric, app, settle } = setup()
    await settle(
      ['View', '  View', '    Paragraph', '      RawText "count:0"', '    View'].join('\n'),
    )
    const commitsBefore = fabric.calls.completeRoot

    const appRoot = fabric.committed[0]!.children[0]!
    fabric.emit(appRoot, 'topLayout', { layout: { x: 0, y: 0, width: 1, height: 1 } })

    // The removed child also exercises unmounting a subtree.
    await settle(['View', '  View', '    Paragraph', '      RawText "count:1"'].join('\n'))
    expect(fabric.calls.completeRoot - commitsBefore).toBe(1)
    app.dispose()
  })

  it('takes the app off the surface on dispose', async () => {
    const { fabric, app, settle } = setup()
    await settle(
      ['View', '  View', '    Paragraph', '      RawText "count:0"', '    View'].join('\n'),
    )

    app.dispose()

    await settle('')
    expect(fabric.committed).toEqual([])
  })
})
