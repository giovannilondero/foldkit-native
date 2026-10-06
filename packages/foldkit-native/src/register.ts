import {
  type Conditions,
  Engine,
  getFabricUIManager,
  registerPlatformComponents,
} from '@ng-native/fabric'
import {
  AppRegistry,
  Appearance,
  Dimensions,
  Image,
  PixelRatio,
  Platform,
  StyleSheet,
  processColor,
} from 'react-native'

import { type MountedApp, type NativeHost, type NativeProgram, mount } from './mount.ts'

// NOTE: re-derived from `Dimensions`, `Appearance` and `PixelRatio`, because
// `@ng-native/device` (which has these) imports `@angular/core`.
const currentConditions = (): Conditions => {
  const { width, height } = Dimensions.get('window')
  return {
    width,
    height,
    colorScheme: Appearance.getColorScheme() === 'dark' ? 'dark' : 'light',
    fontScale: PixelRatio.getFontScale(),
  }
}

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
  appKey = 'main',
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
    const engine = new Engine(getFabricUIManager(), surfaceId, {
      processColor: value => processColor(value),
      resolveAssetSource: value =>
        Image.resolveAssetSource(value as Parameters<typeof Image.resolveAssetSource>[0]),
      conditions: currentConditions(),
      tokens: { '--hairline': { length: StyleSheet.hairlineWidth } },
    })
    current = { surfaceId, app: mount(engine, makeProgram) }
  })
}
