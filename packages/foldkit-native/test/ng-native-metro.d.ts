// The build-time CSS compiler `withTailwind` runs. CJS with no types; this is
// the slice the tests use.
declare module '@ng-native/metro/css/compile.cjs' {
  import type { StyleSheet } from '@ng-native/fabric'

  export const compileCss: (source: string, context: string) => StyleSheet
}
