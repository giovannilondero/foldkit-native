// Test helpers shared with apps: the vendored fake Fabric and a hand-driven
// animation frame clock. Node-only; never imported by `src/`.
export { createFakeFabric, type FakeFabric, type FakeFabricNode } from './fakeFabric.ts'

/** A `requestAnimationFrame` the test advances by hand. */
export const manualFrames = () => {
  const pending: Array<() => void> = []
  return {
    requestAnimationFrame: (callback: () => void) => {
      pending.push(callback)
    },
    flush: () => {
      pending.splice(0).forEach(callback => callback())
    },
  }
}
