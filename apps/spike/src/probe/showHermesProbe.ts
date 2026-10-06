// S3 probe screen (disposable): runs the Hermes probe and draws its report straight on the
// Engine, one line per check, and logs the same lines to Metro with a `[hermes-probe]` prefix.
import { claimHost, type Engine, type EngineNode } from '@ng-native/fabric'

import { type ProbeCheck, runHermesProbe } from './hermesProbe'

// Web globals Effect, @effect/platform-browser or Foldkit may reach for. Logged, not asserted.
const globalsOfInterest = [
  'window',
  'queueMicrotask',
  'setImmediate',
  'structuredClone',
  'FinalizationRegistry',
  'WeakRef',
  'AbortController',
  'TextEncoder',
  'TextDecoder',
  'URL',
  'performance',
  'MessageChannel',
  'requestAnimationFrame',
  'Element',
  'document',
] as const

const describeGlobals = (): string => {
  const scope = globalThis as Record<string, unknown>
  const missing = globalsOfInterest.filter(name => scope[name] === undefined)
  return missing.length === 0 ? 'all present' : `missing: ${missing.join(', ')}`
}

const line = (engine: Engine, text: string, color: string): EngineNode => {
  const node = engine.createElement('text')
  engine.setProp(node, 'style', { fontSize: 15, color, marginBottom: 8 })
  engine.appendChild(node, engine.createText(text))
  claimHost(node)
  return node
}

const log = (text: string): void => console.log(`[hermes-probe] ${text}`)

export const showHermesProbe = (engine: Engine): void => {
  const host = engine.createElement('view')
  engine.setProp(host, 'style', { height: '100%', paddingTop: 96, paddingHorizontal: 24 })
  claimHost(host)
  engine.appendChild(engine.root, host)

  const show = (text: string, color = '#111111'): void => {
    log(text)
    engine.appendChild(host, line(engine, text, color))
    engine.commit()
  }

  show('S3 Hermes probe', '#000000')
  show(`engine: ${'HermesInternal' in globalThis ? 'Hermes' : 'not Hermes'}`)
  show(`globals: ${describeGlobals()}`, '#555555')

  const showCheck = ({ name, ok, detail }: ProbeCheck): void =>
    show(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`, ok ? '#0a7d28' : '#c01818')

  runHermesProbe().then(
    report => {
      report.forEach(showCheck)
      show(report.every(check => check.ok) ? 'ALL PASS' : 'SOME CHECKS FAILED')
    },
    (error: unknown) => show(`probe crashed: ${String(error)}`, '#c01818'),
  )
}
