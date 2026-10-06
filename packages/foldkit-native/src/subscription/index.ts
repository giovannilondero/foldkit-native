import { Effect, Queue, Stream } from 'effect'

// NOTE: extensionless on purpose, so Metro picks `appStateSource.native.ts`
// on device and everything else (tsc, Vitest) gets `appStateSource.ts`.
import { defaultAppState } from './appStateSource'
import type { AppStateSource, AppStateStatus } from './source.ts'

export type { AppStateSource, AppStateStatus } from './source.ts'

const isKnown = (state: AppStateSource['currentState']): state is AppStateStatus =>
  state === 'active' ||
  state === 'background' ||
  state === 'inactive' ||
  state === 'unknown' ||
  state === 'extension'

/**
 * The app's lifecycle state from `source`: the current state on start, then
 * every change, with repeats dropped. The listener is removed when the
 * Stream ends, so a Subscription that stops releases it.
 */
export const appStateChanges = (source: AppStateSource): Stream.Stream<AppStateStatus> =>
  Stream.callback<AppStateStatus>(queue =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const current = source.currentState
        Queue.offerUnsafe(queue, isKnown(current) ? current : 'unknown')
        return source.addEventListener('change', state => {
          Queue.offerUnsafe(queue, state)
        })
      }),
      subscription => Effect.sync(() => subscription.remove()),
    ),
  ).pipe(Stream.changes)

/** The device's AppState as a Stream, for `Subscription.persistent` or an
 *  entry's `dependenciesToStream`. Off device it stays `active`. */
export const appState: Stream.Stream<AppStateStatus> = appStateChanges(defaultAppState)
