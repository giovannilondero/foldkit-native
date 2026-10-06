# apps/spike

The Expo SDK 57 **dev client** (New Architecture and Hermes, both unconditional in SDK 57) that hosts the Demo Ladder. It does not run in Expo Go.

`src/main.ts` registers `main` with `AppRegistry.registerRunnable` and draws through `@ng-native/fabric`'s Engine. There is no `registerRootComponent` and no React in the render path.

## Setup (from the repo root)

Tested with Node 26 and pnpm 12.3.

```sh
git submodule update --init          # vendor/foldkit @ platform-seam
pnpm install
pnpm build                           # builds the fork (tsc -b) and type-checks foldkit-native
pnpm test                            # Node tests (vitest): foldkit-native and the spike probe
```

Run pnpm commands from the repo root with `-F <name>` (for example `pnpm -F foldkit build`). Running `pnpm` inside `vendor/foldkit` picks up the fork's own `pnpm-workspace.yaml` and installs the whole Foldkit monorepo into the submodule, which then shadows this workspace's links.

The fork is a workspace member, consumed from its `dist/`. Rebuild it (`pnpm build:foldkit`) after pulling a new `platform-seam` commit (`git submodule update --remote vendor/foldkit`).

## Run on a device

`ios/` and `android/` are generated (CNG) and gitignored.

```sh
cd apps/spike
pnpm prebuild                        # expo prebuild --clean
pnpm ios                             # expo run:ios: builds, installs, starts Metro
pnpm android                         # expo run:android: same for the emulator
pnpm start                           # Metro only, for an already installed dev client
```

`expo run:ios --device <udid>` / `expo run:android --device <avd>` pick a target, and `--port <n>` moves Metro off 8081.

## Hermes probe (S3)

`src/probe/` is a disposable dev screen that `src/main.ts` shows until the Foldkit mount (#14) replaces it. It runs an Effect program (forked fibers + join + interrupt, a `Schedule.max([spaced, recurs])` repeat, a `Stream` pipeline, a `Data.TaggedEnum` with `$match`) and a Foldkit counter booted with `makeElement` + `Runtime.embed` on a plain-object container through the fork's `platform` seam (in-memory DOMAPI, no Fabric). It prints one PASS/FAIL line per check on screen and in Metro (`[hermes-probe] …`). `pnpm -F spike test` runs the same probe in Node.

Result (2026-10-06, iPhone 17 iOS 26.5 and Pixel_9 API 36): every check passes on Hermes. **No polyfills are needed.**

| Global | On Hermes (RN 0.86 + `expo`) | Consequence |
|---|---|---|
| `FinalizationRegistry` | missing | Nothing in `effect@4.0.0`, `@effect/platform-browser@4.0.0` or the fork's `dist/` references it. No polyfill. |
| `MessageChannel` | missing | Foldkit's message queue already falls back to `setTimeout(0)` for its deferred drain (`runtime/messageQueue.ts`). No polyfill. |
| `document` | missing | Only Browser Effects touch it; they stay unsupported (spec §Browser Effects). No polyfill. |
| `window` | present (RN aliases it to the global object) | Foldkit's devtools config reads `window.self !== window.top` on every boot. Node tests have no `window`: stub it (`vi.stubGlobal('window', globalThis)`). |
| `setImmediate`, `queueMicrotask`, `WeakRef`, `structuredClone`, `AbortController`, `TextEncoder`/`TextDecoder`, `URL`, `performance`, `requestAnimationFrame`, `Element` | present | Effect's scheduler uses `setImmediate`. `Element` exists as a global on RN 0.86, so Foldkit's `instanceof Element` checks see a real constructor (and are `false` for host nodes). |
