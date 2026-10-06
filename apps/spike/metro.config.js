// Plain Expo Metro config (spec §Fixed choices): no ng-native preset.
//
// `withTailwind` (rung 6) returns the config unchanged. Loading it runs the
// Tailwind CLI over `src/styles.css`, which scans `src/` for class strings,
// compiles the CSS into the module `src/main.ts` imports
// (`.tailwind/app.tailwind.js`, gitignored) and, for a dev server, keeps
// `tailwindcss --watch` running. `node metro.config.js` generates it once.
const { getDefaultConfig } = require('expo/metro-config')
const { withTailwind } = require('@ng-native/tailwind/config.cjs')

module.exports = withTailwind(getDefaultConfig(__dirname), {
  input: './src/styles.css',
  output: './.tailwind/app.tailwind.js',
})
