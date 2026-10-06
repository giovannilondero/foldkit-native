// Expo's runtime first: its streaming fetch, TextDecoder, URL and structuredClone. Without this
// import a release build gets React Native's fetch, which has no response body.
import 'expo'

import { registerApp } from 'foldkit-native'

// The Tailwind sheet `withTailwind` writes when Metro loads its config (rung 6).
import tailwind from '../.tailwind/app.tailwind.js'
import { makeSpike } from './app'

// No registerRootComponent: the app owns the surface through Fabric directly, with no React
// in the render path.
registerApp(makeSpike, { styleSheet: tailwind })
