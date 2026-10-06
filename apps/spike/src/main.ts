// Expo's runtime first: its streaming fetch, TextDecoder, URL and structuredClone. Without this
// import a release build gets React Native's fetch, which has no response body.
import 'expo'

import { Engine, getFabricUIManager, registerPlatformComponents } from '@ng-native/fabric'
import { AppRegistry, Platform, processColor } from 'react-native'

import { showHermesProbe } from './probe/showHermesProbe'

registerPlatformComponents(Platform.OS)

// No registerRootComponent: the app owns the surface through Fabric directly, with no React
// in the render path.
AppRegistry.registerRunnable('main', ({ rootTag }: { rootTag: number | string }) => {
  const engine = new Engine(getFabricUIManager(), Number(rootTag), { processColor })
  // S3: the disposable Hermes probe screen. The Foldkit mount (#14) replaces it.
  showHermesProbe(engine)
})
