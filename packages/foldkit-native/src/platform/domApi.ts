/* eslint-disable @typescript-eslint/consistent-type-assertions */
import { claimHost, type Engine, type EngineNode } from '@ng-native/fabric'
import type { DOMAPI, VNode } from 'foldkit/runtime'

// NOTE: snabbdom's DOMAPI is typed with DOM nodes, but every node the Fabric
// Platform hands out is an EngineNode. These casts are the one place the two
// meet; nothing downstream reads a DOM member off them.
export const asDomNode = <T extends Node>(node: EngineNode): T =>
  node as unknown as T

export const asEngineNode = (node: Node): EngineNode =>
  node as unknown as EngineNode

/** The Engine node snabbdom patched `vnode` onto, if it has one yet. */
export const engineNodeOf = (vnode: VNode): EngineNode | undefined =>
  vnode.elm === undefined ? undefined : asEngineNode(vnode.elm)

const createElement = (engine: Engine, tagName: string): EngineNode => {
  // NOTE: snabbdom passes the vnode data as a second argument; the Engine's
  // second parameter is a style sheet, so it is dropped on purpose.
  const node = engine.createElement(tagName)
  // Silences the Engine's dev check for a Native Element created directly
  // rather than through a framework wrapper.
  claimHost(node)
  return node
}

/** Whether `node` may hold raw text: only a `text` element (a Paragraph, or a
 *  span inside one) can. */
const acceptsText = (node: EngineNode): boolean =>
  node.kind === 'element' && node.name === 'text'

type LooseText = Readonly<{
  insertBefore: (parent: EngineNode, child: EngineNode, reference: EngineNode | null) => void
  removeChild: (parent: EngineNode, child: EngineNode) => void
  parentNode: (node: EngineNode) => EngineNode | null
  nextSibling: (node: EngineNode) => EngineNode | null
}>

/**
 * Raw text outside a `text` element. `n` makes it a compile error, but a cast
 * or a plain snabbdom view can still produce it, and Fabric must never see a
 * `RawText` outside a Paragraph. Such a text node stays out of the Engine
 * tree and a dev warning names it. An anchor, which is never committed, holds
 * its place, so snabbdom's sibling lookups, moves and removals still line up.
 */
const makeLooseText = (engine: Engine): LooseText => {
  const anchors = new WeakMap<EngineNode, EngineNode>()

  /** What stands in the Engine tree for `node`: its anchor, if it is loose. */
  const placed = (node: EngineNode): EngineNode => anchors.get(node) ?? node

  const unloose = (node: EngineNode): void => {
    const anchor = anchors.get(node)
    if (anchor === undefined) {
      return
    }
    anchors.delete(node)
    const parent = engine.parentNode(anchor)
    if (parent !== null) {
      engine.removeChild(parent, anchor)
    }
  }

  const loosen = (node: EngineNode): EngineNode => {
    const existing = anchors.get(node)
    if (existing !== undefined) {
      return existing
    }
    const anchor = engine.createAnchor()
    anchors.set(node, anchor)
    console.warn(
      `Foldkit Native: the text "${node.text}" sits outside n.text, so it is not drawn. ` +
        'Raw text may only appear inside n.text.',
    )
    return anchor
  }

  return {
    insertBefore: (parent, child, reference) => {
      const target = reference === null ? null : placed(reference)
      if (child.kind === 'text' && !acceptsText(parent)) {
        engine.insertBefore(parent, loosen(child), target)
        return
      }
      unloose(child)
      engine.insertBefore(parent, child, target)
    },
    removeChild: (parent, child) => engine.removeChild(parent, placed(child)),
    parentNode: node => engine.parentNode(placed(node)),
    nextSibling: node => engine.nextSibling(placed(node)),
  }
}

/** Removes every child of an element, then gives it one text child when
 *  `text` is non-empty. Foldkit restores its container on dispose with
 *  `setTextContent(container, '')`, which must leave it empty. */
const replaceChildrenWithText = (
  engine: Engine,
  looseText: LooseText,
  node: EngineNode,
  text: string,
): void => {
  for (const child of [...node.children]) {
    engine.removeChild(node, child)
  }
  if (text !== '') {
    looseText.insertBefore(node, engine.createText(text), null)
  }
}

/** snabbdom's DOMAPI over the Fabric Engine. Element names are Native
 *  Elements (`view`, `text`, `scroll-view`, ...), comments become Engine
 *  anchors, and text goes through `setText`. */
export const makeDomApi = (engine: Engine): DOMAPI => {
  const looseText = makeLooseText(engine)
  return {
    createElement: (tagName: string) =>
      asDomNode<HTMLElement>(createElement(engine, tagName)),
    createElementNS: (_namespace: string, tagName: string) =>
      asDomNode<Element>(createElement(engine, tagName)),
    createTextNode: (text: string) => asDomNode<Text>(engine.createText(text)),
    createComment: () => asDomNode<Comment>(engine.createAnchor()),
    insertBefore: (parentNode, newNode, referenceNode) =>
      looseText.insertBefore(
        asEngineNode(parentNode),
        asEngineNode(newNode),
        referenceNode === null ? null : asEngineNode(referenceNode),
      ),
    removeChild: (node, child) =>
      looseText.removeChild(asEngineNode(node), asEngineNode(child)),
    appendChild: (node, child) =>
      looseText.insertBefore(asEngineNode(node), asEngineNode(child), null),
    parentNode: node => {
      const parent = looseText.parentNode(asEngineNode(node))
      return parent === null ? null : asDomNode(parent)
    },
    nextSibling: node => {
      const sibling = looseText.nextSibling(asEngineNode(node))
      return sibling === null ? null : asDomNode(sibling)
    },
    tagName: elm => asEngineNode(elm).name,
    setTextContent: (node, text) => {
      const engineNode = asEngineNode(node)
      switch (engineNode.kind) {
        case 'text':
          return engine.setText(engineNode, text ?? '')
        case 'element':
          return replaceChildrenWithText(engine, looseText, engineNode, text ?? '')
        case 'anchor':
          return
      }
    },
    getTextContent: node => asEngineNode(node).text,
    isElement: (node): node is Element => asEngineNode(node).kind === 'element',
    isText: (node): node is Text => asEngineNode(node).kind === 'text',
    isComment: (node): node is Comment => asEngineNode(node).kind === 'anchor',
  }
}
