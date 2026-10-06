import { Engine } from '@ng-native/fabric'
import { Layer } from 'effect'
import { FetchHttpClient } from 'effect/http'
import { layer as httpLayer } from 'foldkit/http'
import { mount } from 'foldkit-native/mount'
import { createFakeFabric, type FakeFabricNode, manualFrames } from 'foldkit-native/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { makeSpike } from '../app'

// NOTE: React Native aliases `window` to the global object and Foldkit reads
// `window.self` at boot. Node has no `window`.
beforeEach(() => {
  vi.stubGlobal('window', globalThis)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const findByTestID = (
  nodes: ReadonlyArray<FakeFabricNode>,
  testID: string,
): FakeFabricNode | undefined => {
  for (const node of nodes) {
    const hit = node.props['testID'] === testID ? node : findByTestID(node.children, testID)
    if (hit !== undefined) {
      return hit
    }
  }
  return undefined
}

type PendingFetch = Readonly<{
  url: string
  resolve: (response: Response) => void
  reject: (error: unknown) => void
}>

/** A `fetch` that parks every request until the test settles it, so the
 *  loading state is observable. It stands in for the platform's fetch under
 *  the app's real `HttpClient` Layer (Foldkit's `Http.layer`). */
const makeFakeFetch = () => {
  const pending: Array<PendingFetch> = []
  const fetch: typeof globalThis.fetch = input =>
    new Promise<Response>((resolve, reject) => {
      pending.push({ url: String(input), resolve, reject })
    })
  const next = (): PendingFetch => {
    const request = pending.shift()
    if (request === undefined) {
      throw new Error('No request in flight')
    }
    return request
  }
  return { fetch, pending, next }
}

const todoResponse = (title: string): Response =>
  new Response(JSON.stringify({ userId: 1, id: 1, title, completed: false }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

const setup = () => {
  const fabric = createFakeFabric()
  const engine = new Engine(fabric, 1, { processColor: value => value })
  const frames = manualFrames()
  const fakeFetch = makeFakeFetch()
  const resources = httpLayer.pipe(
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fakeFetch.fetch)),
  )
  const app = mount(engine, host => makeSpike(host, resources), {
    requestAnimationFrame: frames.requestAnimationFrame,
  })

  const settle = async (isSettled: () => boolean): Promise<void> => {
    await vi.waitFor(() => {
      frames.flush()
      expect(isSettled()).toBe(true)
    })
  }

  const byTestID = (testID: string): FakeFabricNode | undefined =>
    findByTestID(fabric.committed, testID)

  const tap = (testID: string): void => {
    const node = byTestID(testID)
    if (node === undefined) {
      throw new Error(`Nothing committed with testID ${testID}`)
    }
    const point = { identifier: 0, target: node.reactTag, pageX: 5, pageY: 5, timestamp: 0 }
    fabric.emit(node, 'topTouchStart', { ...point, touches: [point], changedTouches: [point] })
    fabric.emit(node, 'topTouchEnd', { ...point, touches: [], changedTouches: [point] })
  }

  /** A finger that lands on `testID` and stays down. */
  const touchDown = (testID: string): void => {
    const node = byTestID(testID)
    if (node === undefined) {
      throw new Error(`Nothing committed with testID ${testID}`)
    }
    const point = { identifier: 1, target: node.reactTag, pageX: 5, pageY: 5, timestamp: 0 }
    fabric.emit(node, 'topTouchStart', { ...point, touches: [point], changedTouches: [point] })
  }

  const has = (text: string) => () => fabric.render().includes(text)

  const openHttp = async () => {
    await settle(() => byTestID('menu.Http') !== undefined)
    tap('menu.Http')
    await settle(() => byTestID('http.status') !== undefined)
  }

  return { app, fakeFetch, settle, byTestID, tap, touchDown, has, openHttp }
}

describe('HTTP demo', () => {
  it('fetches JSON on open: loading, then the decoded todo', async () => {
    const { app, fakeFetch, settle, has, openHttp } = setup()
    await openHttp()

    await settle(has('Loading'))
    await vi.waitFor(() => expect(fakeFetch.pending).toHaveLength(1))
    const request = fakeFetch.next()
    expect(request.url).toBe('https://jsonplaceholder.typicode.com/todos/1')

    request.resolve(todoResponse('delectus aut autem'))
    await settle(has('delectus aut autem'))
    expect(has('Loading')()).toBe(false)
    app.dispose()
  })

  it('leaving while a finger holds a button on the screen keeps commits valid', async () => {
    const { app, fakeFetch, settle, tap, has, byTestID, openHttp, touchDown } = setup()
    await openHttp()
    await vi.waitFor(() => expect(fakeFetch.pending).toHaveLength(1))
    fakeFetch.next().resolve(todoResponse('ok'))
    await settle(has('RawText "ok"'))

    // Back is released, and before the frame that leaves the screen a finger
    // lands on Reload: that frame destroys the button it is holding.
    tap('back')
    touchDown('http.reload')
    await settle(() => byTestID('menu.Http') !== undefined)

    await openHttp()
    await settle(has('Loading'))
    app.dispose()
  })

  it('a forced network error shows loading, then the error', async () => {
    const { app, fakeFetch, settle, tap, has, openHttp } = setup()
    await openHttp()
    await vi.waitFor(() => expect(fakeFetch.pending).toHaveLength(1))
    fakeFetch.next().resolve(todoResponse('ok'))
    await settle(has('RawText "ok"'))

    tap('http.forceError')
    await settle(has('Loading'))
    await vi.waitFor(() => expect(fakeFetch.pending).toHaveLength(1))
    const request = fakeFetch.next()
    expect(new URL(request.url).hostname).toMatch(/\.invalid$/)

    // What React Native's fetch rejects with when the host is unreachable.
    request.reject(new TypeError('Network request failed'))
    await settle(has('Network error'))
    expect(has('Loading')()).toBe(false)

    // Retrying recovers.
    tap('http.reload')
    await settle(has('Loading'))
    await vi.waitFor(() => expect(fakeFetch.pending).toHaveLength(1))
    fakeFetch.next().resolve(todoResponse('again'))
    await settle(has('RawText "again"'))
    app.dispose()
  })
})
