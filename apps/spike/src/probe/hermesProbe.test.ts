import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runHermesProbe } from './hermesProbe'

// The same probe the dev client runs on Hermes (S3), asserted in Node.
describe('Hermes probe', () => {
  // Foldkit's devtools config reads `window.self !== window.top` on every boot. React Native
  // aliases `window` to the global object; plain Node has no `window`, so mirror RN here.
  beforeEach(() => {
    vi.stubGlobal('window', globalThis)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('runs fibers, Schedule, Stream and a Data.TaggedEnum', async () => {
    const report = await runHermesProbe()

    expect(report.filter(check => check.name !== 'foldkit')).toEqual([
      { name: 'fibers', ok: true, detail: 'joined 3, interrupted the never fiber' },
      { name: 'schedule', ok: true, detail: 'ran 4 times' },
      { name: 'stream', ok: true, detail: '2,4,6,8,10' },
      { name: 'taggedEnum', ok: true, detail: 'Loaded(42) / Failed(boom)' },
    ])
  })

  it('embeds a Foldkit makeElement on an in-memory container, patches on a click and restores the container on dispose', async () => {
    const report = await runHermesProbe()

    expect(report.find(check => check.name === 'foldkit')).toEqual({
      name: 'foldkit',
      ok: true,
      detail: 'count:0 -> count:1, container restored',
    })
  })
})
