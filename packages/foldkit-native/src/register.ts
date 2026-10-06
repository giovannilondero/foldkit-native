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

/**
 * Registers a Foldkit program as the React Native app `appKey`, rendered
 * through the Fabric Engine with no React in the render path. Call it once
 * from the app's entry file, after `import 'expo'`.
 *
 * On the New Architecture native stops a surface (a reload, a Fast Refresh
 * that falls back to a full reload, the host tearing down) by calling the
 * global `RN$stopSurface`, which React's renderer installs. With no React it
 * is missing and native logs "stopSurface failed. Global was not installed",
 * so this installs it and disposes the app on that surface. The previous app
 * is also disposed if the runnable starts again on a new surface.
 */
export const registerApp = <Resources = never>(
  makeProgram: (host: NativeHost) => NativeProgram<Resources>,
  { appKey = 'main', styleSheet }: RegisterAppOptions = {},
): void => {
  registerPlatformComponents(Platform.OS)

  let current: Readonly<{ surfaceId: number; app: MountedApp }> | undefined

  const dispose = (): void => {
    const stopping = current
    current = undefined
    stopping?.app.dispose()
  }

  const host = globalThis as { RN$stopSurface?: (surfaceId: number) => void }
  const previousStopSurface = host.RN$stopSurface
  host.RN$stopSurface = surfaceId => {
    if (current?.surfaceId === surfaceId) {
      dispose()
    }
    previousStopSurface?.(surfaceId)
  }

  AppRegistry.registerRunnable(appKey, ({ rootTag }: { rootTag: number | string }) => {
    dispose()
    const surfaceId = Number(rootTag)
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
    current = {
      surfaceId,
      app: {
        engine,
        dispose: () => {
          unwatch()
          app.dispose()
        },
      },
    }
  })
}
