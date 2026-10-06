import { AppState } from 'react-native'

import type { AppStateSource } from './source.ts'

// Picked by Metro's platform extensions on iOS and Android, so Node never
// loads `react-native` through `foldkit-native/subscription`.

/** The AppState `appState` follows: React Native's own. */
export const defaultAppState: AppStateSource = AppState
