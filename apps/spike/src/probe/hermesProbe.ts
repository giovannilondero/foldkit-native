// S3 probe (disposable): does Effect 4 and the Foldkit fork run on Hermes? The dev client runs
// it on boot and prints the report; hermesProbe.test.ts runs the same program in Node.
import { Data, Effect, Fiber, Ref, Schedule, Stream } from 'effect'

import { probeFoldkitEmbed } from './foldkitProbe'

export type ProbeCheck = Readonly<{ name: string; ok: boolean; detail: string }>

const check = (name: string, expected: string, actual: string): ProbeCheck => ({
  name,
  ok: actual === expected,
  detail: actual,
})

const fibers = Effect.gen(function* () {
  const one = yield* Effect.forkChild(Effect.succeed(1).pipe(Effect.delay('5 millis')))
  const two = yield* Effect.forkChild(Effect.succeed(2).pipe(Effect.delay('1 millis')))
  const stuck = yield* Effect.forkChild(Effect.never)
  const sum = (yield* Fiber.join(one)) + (yield* Fiber.join(two))
  yield* Fiber.interrupt(stuck)
  const exit = yield* Fiber.await(stuck)
  const interrupted = exit._tag === 'Failure' ? 'interrupted the never fiber' : 'never fiber kept running'
  return check('fibers', 'joined 3, interrupted the never fiber', `joined ${sum}, ${interrupted}`)
})

const schedule = Effect.gen(function* () {
  const runs = yield* Ref.make(0)
  yield* Ref.update(runs, n => n + 1).pipe(
    Effect.repeat(Schedule.max([Schedule.spaced('2 millis'), Schedule.recurs(3)])),
  )
  return check('schedule', 'ran 4 times', `ran ${yield* Ref.get(runs)} times`)
})

const stream = Stream.range(1, 5).pipe(
  Stream.map(n => n * 2),
  Stream.runCollect,
  Effect.map(values => check('stream', '2,4,6,8,10', values.join(','))),
)

type Load = Data.TaggedEnum<{
  Loading: {}
  Loaded: { readonly value: number }
  Failed: { readonly reason: string }
}>
const Load = Data.taggedEnum<Load>()

const describeLoad = Load.$match({
  Loading: () => 'Loading',
  Loaded: ({ value }) => `Loaded(${value})`,
  Failed: ({ reason }) => `Failed(${reason})`,
})

const taggedEnum = Effect.sync(() =>
  check(
    'taggedEnum',
    'Loaded(42) / Failed(boom)',
    `${describeLoad(Load.Loaded({ value: 42 }))} / ${describeLoad(Load.Failed({ reason: 'boom' }))}`,
  ),
)

const settle = (name: string, probe: Effect.Effect<ProbeCheck, unknown>) =>
  probe.pipe(
    Effect.catchCause(cause => Effect.succeed<ProbeCheck>({ name, ok: false, detail: String(cause) })),
  )

export const runHermesProbe = (): Promise<ReadonlyArray<ProbeCheck>> =>
  Effect.runPromise(
    Effect.all([
      settle('fibers', fibers),
      settle('schedule', schedule),
      settle('stream', stream),
      settle('taggedEnum', taggedEnum),
      settle('foldkit', probeFoldkitEmbed),
    ]),
  )
