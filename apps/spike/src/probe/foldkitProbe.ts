// Boots a Foldkit counter with makeElement + Runtime.embed on a plain-object container through
// the fork's Platform seam, clicks it, and disposes it. The in-memory DOMAPI is adapted from the
// fork's runtime/platform.test.ts: no DOM, no Fabric. The real Fabric Platform is #14.
import { Data, Effect, Schedule, Schema } from 'effect'
import type { Html } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import {
  type DOMAPI,
  type Module,
  type Platform,
  type VNode,
  embed,
  makeElement,
  onUnmountModule,
} from 'foldkit/runtime'

import type { ProbeCheck } from './hermesProbe'

type FakeNode = {
  kind: 'Element' | 'Text' | 'Comment'
  tag: string
  text: string
  id: string
  parent: FakeNode | undefined
  children: Array<FakeNode>
  listeners: Record<string, (event: unknown) => void>
}

const makeFakeNode = (kind: FakeNode['kind'], tag = '', text = ''): FakeNode => ({
  kind,
  tag,
  text,
  id: '',
  parent: undefined,
  children: [],
  listeners: {},
})

// The DOMAPI is typed against DOM nodes; the fake tree stands in for them.
const asNode = (node: FakeNode): Node => node as unknown as Node
const asFake = (node: Node): FakeNode => node as unknown as FakeNode

const detach = (child: FakeNode): void => {
  if (child.parent !== undefined) {
    const siblings = child.parent.children
    siblings.splice(siblings.indexOf(child), 1)
    child.parent = undefined
  }
}

const attach = (parent: FakeNode, child: FakeNode, before: FakeNode | undefined): void => {
  detach(child)
  child.parent = parent
  if (before === undefined) {
    parent.children.push(child)
  } else {
    parent.children.splice(parent.children.indexOf(before), 0, child)
  }
}

const fakeDomApi: DOMAPI = {
  createElement: (tag: string) => makeFakeNode('Element', tag) as unknown as HTMLElement,
  createElementNS: (_ns: string, tag: string) => makeFakeNode('Element', tag) as unknown as Element,
  createTextNode: (text: string) => makeFakeNode('Text', '', text) as unknown as Text,
  createComment: (text: string) => makeFakeNode('Comment', '', text) as unknown as Comment,
  insertBefore: (parent, node, reference) =>
    attach(asFake(parent), asFake(node), reference === null ? undefined : asFake(reference)),
  removeChild: (_parent, child) => detach(asFake(child)),
  appendChild: (parent, child) => attach(asFake(parent), asFake(child), undefined),
  parentNode: node => {
    const { parent } = asFake(node)
    return parent === undefined ? null : asNode(parent)
  },
  nextSibling: node => {
    const { parent } = asFake(node)
    const next = parent?.children[parent.children.indexOf(asFake(node)) + 1]
    return next === undefined ? null : asNode(next)
  },
  tagName: element => asFake(element).tag,
  setTextContent: (node, text) => {
    const fake = asFake(node)
    fake.children.forEach(child => {
      child.parent = undefined
    })
    fake.children = []
    fake.text = text ?? ''
  },
  getTextContent: node => asFake(node).text,
  isElement: (node): node is Element => asFake(node).kind === 'Element',
  isText: (node): node is Text => asFake(node).kind === 'Text',
  isComment: (node): node is Comment => asFake(node).kind === 'Comment',
}

type Listener = (this: VNode, event: unknown, vnode: VNode) => void

const writeListeners = (_old: VNode, vnode: VNode): void => {
  const element = vnode.elm as unknown as FakeNode
  element.listeners = {}
  Object.entries(vnode.data?.on ?? {}).forEach(([name, handler]) => {
    if (typeof handler === 'function') {
      const listener = handler as Listener
      element.listeners[name] = event => listener.call(vnode, event, vnode)
    }
  })
}

const eventsModule: Partial<Module> = { create: writeListeners, update: writeListeners }

const textOf = (node: FakeNode): string =>
  node.kind === 'Element' ? node.children.map(textOf).join('') : node.text

const findByTag = (node: FakeNode, tag: string): FakeNode | undefined =>
  node.tag === tag
    ? node
    : node.children.reduce<FakeNode | undefined>(
        (found, child) => found ?? findByTag(child, tag),
        undefined,
      )

const Message = defineMessageUnion({ ClickedIncrement: {} })
type Message = typeof Message.Type

const Model = Schema.Struct({ count: Schema.Number })
type Model = typeof Model.Type

class NotYet extends Data.TaggedError('NotYet')<{ readonly waitingFor: string }> {}

export const probeFoldkitEmbed: Effect.Effect<ProbeCheck, NotYet> = Effect.gen(function* () {
  const frames: Array<() => void> = []
  const runFrames = (): void => frames.splice(0).forEach(callback => callback())
  const platform: Platform = {
    domApi: fakeDomApi,
    modules: [eventsModule, onUnmountModule],
    requestFrame: callback => {
      frames.push(callback)
    },
  }

  const root = makeFakeNode('Element', 'root')
  const container = makeFakeNode('Element', 'container')
  container.id = 'hermes-probe'
  fakeDomApi.appendChild(asNode(root), asNode(container))

  // Poll the tree, flushing pending frames, until `ready` holds (or ~1 s passes).
  const waitFor = (waitingFor: string, ready: () => boolean) =>
    Effect.suspend(() => {
      runFrames()
      return ready() ? Effect.void : Effect.fail(new NotYet({ waitingFor }))
    }).pipe(Effect.retry({ schedule: Schedule.spaced('2 millis'), times: 500 }))

  const handle = embed(
    makeElement({
      Model,
      init: () => ({ model: { count: 0 } }),
      update: (model: Model, message: Message) =>
        Message.match<{ model: Model }>(message, {
          ClickedIncrement: () => ({ model: { count: model.count + 1 } }),
        }),
      view: (model: Model, h): Html =>
        h.div(
          [],
          [
            h.button([h.OnClick(Message.ClickedIncrement())], ['+']),
            h.span([], [`count:${model.count}`]),
          ],
        ),
      container: container as unknown as HTMLElement,
      platform,
    }),
  )

  yield* waitFor('first render', () => textOf(root).includes('count:0'))
  const before = textOf(findByTag(root, 'span') ?? root)

  findByTag(root, 'button')?.listeners['click']?.({ type: 'click' })
  yield* waitFor('patch after click', () => textOf(root).includes('count:1'))
  const after = textOf(findByTag(root, 'span') ?? root)

  handle.dispose()
  yield* waitFor('container restored', () => root.children.length === 1 && root.children[0] === container)

  return {
    name: 'foldkit',
    ok: before === 'count:0' && after === 'count:1',
    detail: `${before} -> ${after}, container restored`,
  }
})
