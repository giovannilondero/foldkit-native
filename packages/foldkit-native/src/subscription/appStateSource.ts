import { createMemoryAppState } from './memoryAppState.ts'

// Off device (Node, tests) there is no app lifecycle: the app stays `active`
// unless a test moves it. On iOS and Android, Metro resolves
// `./appStateSource` to `appStateSource.native.ts` instead.

/** The AppState `appState` follows. */
export const defaultAppState = createMemoryAppState('active')
