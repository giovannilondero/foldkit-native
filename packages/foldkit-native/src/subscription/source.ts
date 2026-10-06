/** React Native's `AppStateStatus`. iOS passes through `inactive`; `unknown`
 *  and `extension` are iOS-only edge states. */
export type AppStateStatus = 'active' | 'background' | 'inactive' | 'unknown' | 'extension'

/**
 * The slice of React Native's `AppState` the Stream reads. `AppState` itself
 * satisfies it, so a fake only needs these two members.
 */
export type AppStateSource = Readonly<{
  currentState: AppStateStatus | string | null
  addEventListener: (
    type: 'change',
    listener: (state: AppStateStatus) => void,
  ) => Readonly<{ remove: () => void }>
}>
