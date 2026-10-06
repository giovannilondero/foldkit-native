import { Effect, Fiber, Stream } from 'effect'
import { describe, expect, it } from 'vitest'

import { appStateChanges } from '../src/subscription/index.ts'
import { createFakeAppState } from './testing.ts'

/** Runs `stream` in the background, collecting what it emits. */
const collect = <A>(stream: Stream.Stream<A>) => {
  const seen: Array<A> = []
  const fiber = Effect.runFork(
    Stream.runForEach(stream, value => Effect.sync(() => seen.push(value))),
  )
  return { seen, stop: () => Effect.runPromise(Fiber.interrupt(fiber)) }
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0))

describe('appStateChanges', () => {
  it('emits the current state, then each change, skipping repeats', async () => {
    const appState = createFakeAppState('active')
    const { seen, stop } = collect(appStateChanges(appState))
    await tick()
    appState.set('inactive')
    appState.set('background')
    appState.set('background')
    appState.set('active')
    await tick()
    expect(seen).toEqual(['active', 'inactive', 'background', 'active'])
    await stop()
  })

  it('stops listening when the stream is interrupted', async () => {
    const appState = createFakeAppState('active')
    const { stop } = collect(appStateChanges(appState))
    await tick()
    expect(appState.listenerCount()).toBe(1)
    await stop()
    expect(appState.listenerCount()).toBe(0)
  })
})
