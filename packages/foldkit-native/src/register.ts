import {
  Engine,
  type StyleSheet as CssStyleSheet,
  getFabricUIManager,
  registerPlatformComponents,
} from '@ng-native/fabric'
import { AppRegistry, Image, Platform, StyleSheet, processColor } from 'react-native'

import { currentConditions, watchConditions } from './css/conditions.ts'
import { attachStyles } from './css/index.ts'
import { type MountedApp, type NativeHost, type NativeProgram, mount } from './mount.ts'

export type RegisterAppOptions = Readonly<{
  /** The React Native app key. Defaults to `main`, Expo's. */
  appKey?: string
  /**
   * A global stylesheet for `Class`: the module `withTailwind` writes. Every
   * element is matched against it, and the root follows the platform and the
   * device's conditions (`ios:`, `dark:`, media queries).
   */
  styleSheet?: CssStyleSheet
}>

type RunningApp = Readonly<{ surfaceId: number; app: MountedApp }>

/** What one app key has running, if anything. */
type Registration = { running: RunningApp | undefined }

/**
 * Every app key's registration, and whether `RN$stopSurface` is installed.
 * Kept on the global object rather than in this module, so an entry file
 * evaluated again in the same JS runtime (a hot update) finds the app the
 * previous evaluation started instead of leaking it.
 */
type Registry = { apps: Map<string, Registration>; isStopSurfaceInstalled: boolean }

const REGISTRY = Symbol.for('foldkit-native.registry')

const registry = (): Registry => {
  const global = globalThis as { [REGISTRY]?: Registry }
  global[REGISTRY] ??= { apps: new Map(), isStopSurfaceInstalled: false }
  return global[REGISTRY]
}

const stop = (registration: Registration): void => {
  const stopping = registration.running
  registration.running = undefined
  stopping?.app.dispose()
}

/**
 * On the New Architecture native stops a surface (a reload, the host tearing
 * down) by calling the global `RN$stopSurface`, which React's renderer
 * installs. With no React it is missing and native logs "stopSurface failed.
 * Global was not installed", so it is installed here, once per JS runtime,
 * and stops whichever app runs on that surface.
 */
const installStopSurface = (apps: Registry): void => {
  if (apps.isStopSurfaceInstalled) {
    return
  }
  apps.isStopSurfaceInstalled = true
  const host = globalThis as { RN$stopSurface?: (surfaceId: number) => void }
  const previousStopSurface = host.RN$stopSurface
  host.RN$stopSurface = surfaceId => {
    apps.apps.forEach(registration => {
      if (registration.running?.surfaceId === surfaceId) {
        stop(registration)
      }
    })
    previousStopSurface?.(surfaceId)
  }
}

/**
 * Registers a Foldkit program as the React Native app `appKey`, rendered
 * through the Fabric Engine with no React in the render path. Call it from
 * the app's entry file, after `import 'expo'`.
 *
 * The app is disposed when native stops its surface, or when the runnable
 * starts again on a new surface. Calling it again for the same `appKey` in
 * the same JS runtime (an entry file evaluated again) disposes the running
 * app and mounts the new program on its surface, so nothing is leaked or
 * left drawn by stale code.
 */
export const registerApp = <Resources = never>(
  makeProgram: (host: NativeHost) => NativeProgram<Resources>,
  { appKey = 'main', styleSheet }: RegisterAppOptions = {},
): void => {
  registerPlatformComponents(Platform.OS)

  const apps = registry()
  installStopSurface(apps)
  const registration = apps.apps.get(appKey) ?? { running: undefined }
  apps.apps.set(appKey, registration)

  const start = (surfaceId: number): void => {
    stop(registration)
    const conditions = currentConditions()
    const engine = new Engine(getFabricUIManager(), surfaceId, {
      processColor: value => processColor(value),
      resolveAssetSource: value =>
        Image.resolveAssetSource(value as Parameters<typeof Image.resolveAssetSource>[0]),
      conditions,
      tokens: { '--hairline': { length: StyleSheet.hairlineWidth } },
      globalStyles: styleSheet ?? null,
    })
    const unwatch =
      styleSheet === undefined
        ? () => {}
        : watchConditions(attachStyles(engine, { platform: Platform.OS, conditions }))
    const app = mount(engine, makeProgram)
    registration.running = {
      surfaceId,
      app: {
        engine,
        dispose: () => {
          unwatch()
          app.dispose()
        },
      },
    }
  }

  AppRegistry.registerRunnable(appKey, ({ rootTag }: { rootTag: number | string }) => {
    start(Number(rootTag))
  })

  const alreadyRunning = registration.running
  if (alreadyRunning !== undefined) {
    start(alreadyRunning.surfaceId)
  }
}
