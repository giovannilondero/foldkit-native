import { Schema } from 'effect'
import { makeElement, type VNode } from 'foldkit/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createFakeFabric } from './testing.ts'

// NOTE: `registerApp` is the one piece that touches React Native directly.
// Node has no React Native, so the few members it reads are stood in for.
const fabric = createFakeFabric()
const runnables = new Map<string, (parameters: { rootTag: number }) => void>()

vi.mock('react-native', () => ({
  AppRegistry: {
    registerRunnable: (key: string, run: (parameters: { rootTag: number }) => void) => {
      runnables.set(key, run)
    },
  },
  Image: { resolveAssetSource: (value: unknown) => value },
  Platform: { OS: 'ios' },
  StyleSheet: { hairlineWidth: 1 },
  processColor: (value: unknown) => value,
  Dimensions: {
    get: () => ({ width: 400, height: 800 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  Appearance: {
    getColorScheme: () => 'light',
    addChangeListener: () => ({ remove: () => {} }),
  },
  PixelRatio: { getFontScale: () => 1 },
}))

vi.mock('@ng-native/fabric', async importOriginal => ({
  ...(await importOriginal<typeof import('@ng-native/fabric')>()),
  getFabricUIManager: () => fabric,
  registerPlatformComponents: () => {},
}))

const { registerApp } = await import('../src/register.ts')

type Host = { RN$stopSurface?: (surfaceId: number) => void }
const host = globalThis as Host

beforeEach(() => {
  // NOTE: React Native aliases `window` to the global object and Foldkit
  // reads `window.self` at boot. Node has neither, nor an animation frame.
  vi.stubGlobal('window', globalThis)
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => setTimeout(callback, 0))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const text = (value: string): VNode => ({
  sel: 'text',
  data: {},
  children: [
    { sel: undefined, data: undefined, children: undefined, elm: undefined, text: value, key: undefined },
  ],
  elm: undefined,
  text: undefined,
  key: undefined,
})

/** A program that draws one line, standing in for an app's `main.ts`. */
const program =
  (label: string) =>
  ({ container, platform }: { container: HTMLElement; platform: Parameters<typeof makeElement>[0]['platform'] }) =>
    makeElement({
      Model: Schema.Struct({}),
      init: () => ({ model: {} }),
      update: model => ({ model }),
      view: () => text(label),
      container,
      platform,
    })

const drawn = (label: string) =>
  ['View', '  Paragraph', `    RawText "${label}"`].join('\n')

describe('registerApp', () => {
  it('re-running the entry file swaps the running app in place, and stops it once', async () => {
    const stopSurfaceBefore = vi.fn()
    host.RN$stopSurface = stopSurfaceBefore

    registerApp(program('first'))
    runnables.get('main')!({ rootTag: 1 })
    await vi.waitFor(() => expect(fabric.render()).toBe(drawn('first')))

    // What a hot update that re-evaluates the entry file does.
    registerApp(program('second'))
    await vi.waitFor(() => expect(fabric.render()).toBe(drawn('second')))

    host.RN$stopSurface?.(1)
    await vi.waitFor(() => expect(fabric.render()).toBe(''))
    expect(stopSurfaceBefore).toHaveBeenCalledTimes(1)
  })
})
