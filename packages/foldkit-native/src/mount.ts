import { claimHost, type Engine } from '@ng-native/fabric'
import { embed, type MakeRuntimeReturn, type Platform } from 'foldkit/runtime'

import { makeFabricPlatform, type FabricPlatformOptions } from './platform/index.ts'
import { asDomNode } from './platform/domApi.ts'

/** What a Foldkit program needs to render on native: pass both straight to
 *  `makeElement({ ..., container, platform })`. */
export type NativeHost = Readonly<{
  container: HTMLElement
  platform: Platform
}>

/** A program built by `makeElement` (or `makeApplication`) with no Flags.
 *  Ports and Resources are left open: `mount` only embeds the program. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NativeProgram<Resources = never> = MakeRuntimeReturn<
  any,
  void,
  Resources,
  'Application' | 'Element'
>

export type MountedApp = Readonly<{
  engine: Engine
  /** Stops the runtime, releases its tree and takes the host off the surface. */
  dispose: () => void
}>

/** The runtime id Foldkit reads off the container. One app per surface. */
const CONTAINER_ID = 'foldkit-native'

/**
 * Mounts a Foldkit program on an Engine's surface.
 *
 * A full-height host `view` goes under `engine.root`. Inside it sits the
 * container Foldkit renders over: an Engine anchor with an `id`, which Foldkit
 * swaps for the app's root element and puts back on dispose. An anchor is
 * never committed, so the host's style survives the swap.
 */
export const mount = <Resources = never>(
  engine: Engine,
  makeProgram: (host: NativeHost) => NativeProgram<Resources>,
  options: FabricPlatformOptions = {},
): MountedApp => {
  const host = engine.createElement('view')
  claimHost(host)
  engine.setDefaultStyle(host, { height: '100%' })

  const container = Object.assign(engine.createAnchor(), { id: CONTAINER_ID })
  engine.appendChild(host, container)
  engine.appendChild(engine.root, host)
  // NOTE: a change made directly under `engine.root` never fires `onDirty`
  // (the root marks itself structurally dirty before checking whether it was
  // clean), so the host is committed here and the Engine starts out clean.
  engine.commit()

  const platform = makeFabricPlatform(engine, options)
  const handle = embed(
    makeProgram({ container: asDomNode<HTMLElement>(container), platform }),
  )

  return {
    engine,
    dispose: () => {
      handle.dispose()
      engine.removeChild(engine.root, host)
      engine.commit()
    },
  }
}
