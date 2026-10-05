// PROTOTYPE — throwaway. A stand-in for snabbdom's VNode and for what the
// Fabric Platform would hand to the Fabric Engine. Not the real thing.

export type Handler = (payload: unknown) => unknown

export type VNode = {
  readonly sel: string
  readonly data: {
    key?: PropertyKey
    class?: string
    style?: Readonly<Record<string, string | number>>
    props?: Readonly<Record<string, unknown>>
    on?: Readonly<Record<string, Handler>>
    // Variant A only: the HTML tag the author wrote, before the Platform mapped it.
    htmlTag?: string
  }
  readonly children: ReadonlyArray<VNode | string>
}

export type Html = VNode | null

// The runtime's dispatcher; Foldkit reads it from a runtime singleton the same way.
let dispatch: (message: unknown) => void = () => {}
export const setDispatch = (f: (message: unknown) => void) => {
  dispatch = f
}
export const send = (message: unknown) => dispatch(message)

const describe = (value: unknown): string =>
  typeof value === 'function'
    ? 'ƒ'
    : typeof value === 'object' && value !== null && '_tag' in value
      ? String(value._tag)
      : JSON.stringify(value)

// Renders a tree the way the Fabric Engine would receive it. Problems a real
// device would hit (raw strings outside a Text) are flagged inline.
export const print = (
  node: VNode | string | null,
  depth = 0,
  parentIsText = false,
): string => {
  const pad = '  '.repeat(depth)
  if (node === null) return ''
  if (typeof node === 'string') {
    const warning = parentIsText
      ? ''
      : '   ⚠ RN: "Text strings must be rendered within a <Text>"'
    return `${pad}"${node}"${warning}\n`
  }
  const { data } = node
  const attrs = [
    data.htmlTag !== undefined ? `html=<${data.htmlTag}>` : '',
    data.key !== undefined ? `key=${String(data.key)}` : '',
    data.class !== undefined ? `class="${data.class}"` : '',
    data.style !== undefined ? `style=${JSON.stringify(data.style)}` : '',
    ...Object.entries(data.props ?? {}).map(([k, v]) => `${k}=${describe(v)}`),
    ...Object.keys(data.on ?? {}).map(k => `on:${k}`),
  ].filter(s => s !== '')
  const isText = node.sel === 'RCTText' || node.sel === 'RCTVirtualText'
  const open = `${pad}<${node.sel}${attrs.length ? ' ' + attrs.join(' ') : ''}>`
  if (node.children.length === 0) return `${open.replace(/>$/, ' />')}\n`
  const shown = node.children.length > 6 ? node.children.slice(0, 3) : node.children
  const hidden = node.children.length - shown.length
  return (
    `${open}\n` +
    shown.map(child => print(child, depth + 1, isText)).join('') +
    (hidden > 0 ? `${pad}  … ${hidden} more children, all built as VNodes\n` : '') +
    `${pad}</${node.sel}>\n`
  )
}

// Finds a node by testID and fires one of its events, as the Engine would.
export const fire = (
  root: Html,
  testId: string,
  event: string,
  payload?: unknown,
): boolean => {
  const walk = (node: VNode | string): VNode | undefined => {
    if (typeof node === 'string') return undefined
    if (node.data.props?.testID === testId) return node
    for (const child of node.children) {
      const found = walk(child)
      if (found) return found
    }
    return undefined
  }
  const target = root === null ? undefined : walk(root)
  const handler = target?.data.on?.[event]
  if (handler === undefined) return false
  handler(payload)
  return true
}
