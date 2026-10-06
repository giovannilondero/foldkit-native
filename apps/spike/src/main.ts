// Expo's runtime first: its streaming fetch, TextDecoder, URL and structuredClone. Without this
// import a release build gets React Native's fetch, which has no response body.
import 'expo'

import { registerApp } from 'foldkit-native'

import { makeSpike } from './app'

// No registerRootComponent: the app owns the surface through Fabric directly, with no React
// in the render path.
registerApp(makeSpike)
