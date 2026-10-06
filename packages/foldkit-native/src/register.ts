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
 * Fabric never tells a runnable its surface went away
 * (`unmountApplicationComponentAtRootTag` is a no-op there), so the previous
 * app is disposed when the runnable starts again on a new surface. A Fast
 * Refresh edit outside React components is a full reload, which ends the JS
 * runtime itself.
 */
export const registerApp = (
  makeProgram: (host: NativeHost) => NativeProgram,
  appKey = 'main',
): void => {
  registerPlatformComponents(Platform.OS)

  let current: MountedApp | undefined

  AppRegistry.registerRunnable(appKey, ({ rootTag }: { rootTag: number | string }) => {
    current?.dispose()
    const engine = new Engine(getFabricUIManager(), Number(rootTag), {
      processColor: value => processColor(value),
      resolveAssetSource: value =>
        Image.resolveAssetSource(value as Parameters<typeof Image.resolveAssetSource>[0]),
      conditions: currentConditions(),
      tokens: { '--hairline': { length: StyleSheet.hairlineWidth } },
    })
    current = mount(engine, makeProgram)
  })
}
