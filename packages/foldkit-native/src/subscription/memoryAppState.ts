import type { AppStateSource, AppStateStatus } from './source.ts'

export type MemoryAppState = AppStateSource &
  Readonly<{
    /** Moves to `state`, telling every listener (as native does, even if unchanged). */
    set: (state: AppStateStatus) => void
    listenerCount: () => number
  }>

/** An AppState held in memory and moved by hand: the source off device, and in tests. */
export const createMemoryAppState = (initial: AppStateStatus = 'active'): MemoryAppState => {
  const listeners = new Set<(state: AppStateStatus) => void>()
  const appState = {
    currentState: initial,
    addEventListener: (_type: 'change', listener: (state: AppStateStatus) => void) => {
      // NOTE: wrapped so adding the same function twice gives two listeners, like RN.
      const entry = (state: AppStateStatus) => listener(state)
      listeners.add(entry)
      return { remove: () => void listeners.delete(entry) }
    },
    set: (state: AppStateStatus) => {
      appState.currentState = state
      ;[...listeners].forEach(listener => listener(state))
    },
    listenerCount: () => listeners.size,
  }
  return appState
}
