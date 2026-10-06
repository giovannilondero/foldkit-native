/* eslint-disable @typescript-eslint/consistent-type-assertions */
import { claimHost, type Engine, type EngineNode } from '@ng-native/fabric'
import type { DOMAPI } from 'foldkit/runtime'

// NOTE: snabbdom's DOMAPI is typed with DOM nodes, but every node the Fabric
// Platform hands out is an EngineNode. These casts are the one place the two
// meet; nothing downstream reads a DOM member off them.
export const asDomNode = <T extends Node>(node: EngineNode): T =>
  node as unknown as T

export const asEngineNode = (node: Node): EngineNode =>
  node as unknown as EngineNode

const createElement = (engine: Engine, tagName: string): EngineNode => {
  // NOTE: snabbdom passes the vnode data as a second argument; the Engine's
  // second parameter is a style sheet, so it is dropped on purpose.
  const node = engine.createElement(tagName)
  // Silences the Engine's dev check for components used without their wrapper.
  claimHost(node)
  return node
}

/** Removes every child of an element, then gives it one text child when
 *  `text` is non-empty. Foldkit restores its container on dispose with
 *  `setTextContent(container, '')`, which must leave it empty. */
const replaceChildrenWithText = (
  engine: Engine,
  node: EngineNode,
  text: string,
): void => {
  for (const child of [...node.children]) {
    engine.removeChild(node, child)
  }
  if (text !== '') {
    engine.appendChild(node, engine.createText(text))
  }
}

/** snabbdom's DOMAPI over the Fabric Engine. Element names are Native
 *  Elements (`view`, `text`, `scroll-view`, ...), comments become Engine
 *  anchors, and text goes through `setText`. */
export const makeDomApi = (engine: Engine): DOMAPI => ({
  createElement: (tagName: string) =>
    asDomNode<HTMLElement>(createElement(engine, tagName)),
  createElementNS: (_namespace: string, tagName: string) =>
    asDomNode<Element>(createElement(engine, tagName)),
  createTextNode: (text: string) => asDomNode<Text>(engine.createText(text)),
  createComment: () => asDomNode<Comment>(engine.createAnchor()),
  insertBefore: (parentNode, newNode, referenceNode) =>
    engine.insertBefore(
      asEngineNode(parentNode),
      asEngineNode(newNode),
      referenceNode === null ? null : asEngineNode(referenceNode),
    ),
  removeChild: (node, child) =>
    engine.removeChild(asEngineNode(node), asEngineNode(child)),
  appendChild: (node, child) =>
    engine.appendChild(asEngineNode(node), asEngineNode(child)),
  parentNode: node => {
    const parent = engine.parentNode(asEngineNode(node))
    return parent === null ? null : asDomNode(parent)
  },
  nextSibling: node => {
    const sibling = engine.nextSibling(asEngineNode(node))
    return sibling === null ? null : asDomNode(sibling)
  },
  tagName: elm => asEngineNode(elm).name,
  setTextContent: (node, text) => {
    const engineNode = asEngineNode(node)
    switch (engineNode.kind) {
      case 'text':
        return engine.setText(engineNode, text ?? '')
      case 'element':
        return replaceChildrenWithText(engine, engineNode, text ?? '')
      case 'anchor':
        return
    }
  },
  getTextContent: node => asEngineNode(node).text,
  isElement: (node): node is Element => asEngineNode(node).kind === 'element',
  isText: (node): node is Text => asEngineNode(node).kind === 'text',
  isComment: (node): node is Comment => asEngineNode(node).kind === 'anchor',
})
