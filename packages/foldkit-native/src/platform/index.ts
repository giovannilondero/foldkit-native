import type { Engine } from '@ng-native/fabric'
import { onUnmountModule, type Platform } from 'foldkit/runtime'

import { makeDomApi } from './domApi.ts'
import {
  makeClassModule,
  makeDestroyModule,
  makeEventsModule,
  makePropsModule,
  makeStyleModule,
} from './modules.ts'
import { makePressModule } from './press.ts'

export type FabricPlatformOptions = Readonly<{
  /** Defaults to the global `requestAnimationFrame`. Tests pass their own. */
  requestAnimationFrame?: (callback: () => void) => void
}>

/**
 * The Platform that renders a Foldkit runtime through the Fabric Engine.
 *
 * Every render frame patches, then commits once. Anything that dirties the
 * Engine outside a frame (the init render, the crash view, teardown) reaches
 * Fabric through the Engine's `onDirty`, which schedules one commit on the
 * next animation frame. This takes over the Engine's `onDirty`.
 */
export const makeFabricPlatform = (
  engine: Engine,
  options: FabricPlatformOptions = {},
): Platform => {
  const requestAnimationFrame =
    options.requestAnimationFrame ??
    ((callback: () => void) => {
      globalThis.requestAnimationFrame(callback)
    })

  let isInFrame = false
  let isCommitScheduled = false

  engine.setOnDirty(() => {
    if (isInFrame || isCommitScheduled) {
      return
    }
    isCommitScheduled = true
    requestAnimationFrame(() => {
      isCommitScheduled = false
      engine.commit()
    })
  })

  return {
    domApi: makeDomApi(engine),
    modules: [
      makePropsModule(engine),
      makeClassModule(engine),
      makeStyleModule(engine),
      makeEventsModule(engine),
      makePressModule(engine),
      onUnmountModule,
      makeDestroyModule(engine),
    ],
    requestFrame: callback => {
      requestAnimationFrame(() => {
        isInFrame = true
        try {
          callback()
        } finally {
          isInFrame = false
          engine.commit()
        }
      })
    },
  }
}
