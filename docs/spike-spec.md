# Foldkit Native Spike: spec

The Spike shows that a Foldkit app can drive real native iOS/Android views through `@ng-native/fabric`, with no React in the render path. It is judged against the Demo Ladder. The goal is to see something minimally working that validates the idea. The code is disposable, so it can be thrown away and redone more carefully afterwards.

Vocabulary follows [`CONTEXT.md`](../CONTEXT.md). The decisions behind this spec live in the planning map (the issue labelled `wayfinder:map`), and each section links the ticket that holds its detail.

## Fixed choices

- **Render path:** Foldkit's snabbdom, then the Fabric Platform, then the Fabric Engine, then Fabric. There is no React reconciler. React stays in the bundle only because RN's own JS imports it.
- **App host:** an Expo **dev client** with New Architecture and Hermes, on iOS and Android. Expo Go is not supported.
- **Foldkit:** a private fork, branch `platform-seam`, cut from `foldkit@0.166.0` (`75901568`). Every change is shaped so it could become an upstream PR ([Fork Foldkit, or wrap it?](https://github.com/giovannilondero/foldkit-native/issues/5)).
- **Pins (no upgrades without an explicit decision):** Expo SDK 57, RN 0.86 (the ng-native 0.3.0 template), `@ng-native/fabric` pinned exactly to `0.3.0`, Effect `4.0.0`, Foldkit fork at 0.166.0.
- **Metro:** plain `expo/metro-config`. No ng-native Metro preset (it is Angular-bound) and no ng-native config plugin (not needed to render; copy its ~275 MIT lines only if UIScene or the status bar cause a concrete problem).
- **Never import** `@ng-native/device`, `@ng-native/platform`, `@ng-native/testing` or ng-native's polyfills: they pull in Angular, and `animation-globals.js` defines a fake `document` that would confuse Foldkit.

## Repo layout

A pnpm workspace in this repo:

```
foldkit-native/
├── vendor/foldkit/            git submodule → giovannilondero/foldkit @ platform-seam
├── packages/foldkit-native/   the one library package
│   ├── platform/              Fabric Platform: DOMAPI over the Engine, native snabbdom modules, requestFrame
│   ├── mount.ts               registerRunnable + Engine + host container + Runtime.embed
│   ├── view/                  NativeBuilder `n`, NativeAttribute, nativeView
│   ├── css/                   Tailwind/CSS adapter (Demo Ladder rung 6)
│   ├── subscription/          AppState Stream
│   └── test/fakeFabric.ts     vendored from ng-native's test-utils.ts (MIT)
└── apps/spike/                Expo dev-client app hosting the Demo Ladder
```

- **One package.** Internal boundaries get decided only once there is something to publish.
- **The fork is consumed** as a workspace package, built with `tsc -b`. Metro follows the workspace symlinks. If Metro and symlinks fight back, fall back to a `file:` tarball made with `pnpm pack`. Nothing is published to a registry.

## The Foldkit change (`platform-seam`)

Sized and validated in [Where is Foldkit bound to the DOM?](https://github.com/giovannilondero/foldkit-native/issues/2): about +177/−81 across 10 files, with Foldkit's own suite passing. The [research note](https://github.com/giovannilondero/foldkit-native/blob/research/foldkit-dom-binding/research/foldkit-dom-binding.md) §3 has the file-by-file table. The scratch prototype was not kept, so this change is re-implemented from that table.

- `platform?: Platform` (`{ domApi, modules, requestFrame }`) on `makeElement`/`makeApplication`, passed through to `makeRenderer`, with `browserPlatform` as the default.
- `makeApplication` skips hydration and document metadata when it receives a Platform.
- Root mount, unmount and recovery in `vdom.ts`/`renderer.ts` go through `domApi`.
- An `isDomElement` guard on all 12 `instanceof Element` sites in `html/index.ts`.
- A `setTimeout(0)` fallback in `messageQueue.ts` when `MessageChannel` is absent.
- New exports: `Platform`, `browserPlatform`, `onUnmountModule`, the `DOMAPI`/`Module`/`VNode` types, and the dispatcher (`requireDispatch`), which the NativeBuilder needs ([What does a Foldkit Native view look like?](https://github.com/giovannilondero/foldkit-native/issues/6)).

## The Fabric Platform and the mount

Following [What contract does @ng-native/fabric offer a non-Angular renderer?](https://github.com/giovannilondero/foldkit-native/issues/3) ([research note](https://github.com/giovannilondero/foldkit-native/blob/research/ng-native-fabric-contract/research/ng-native-fabric-contract.md) §4–§6):

- **DOMAPI** over the `Engine`: element names are Native Elements, `createComment` becomes `createAnchor`, and `setTextContent` goes through `setText`.
- **Native modules** replace snabbdom's stock list:
  - attrs/props → `setProp`;
  - class → `setClasses`;
  - style → `setProp('style', …)`;
  - events → `setEventListener`, which translates Fabric names (`topPress`, `topChangeText`) into the events `NativeAttribute` handlers expect;
  - Foldkit's `onUnmountModule`, plus a `destroy` hook calling `engine.destroyNode`.
- **Press protocol:** `n.pressable` reimplements the press protocol that ng-native keeps in an Angular directive.
- **Frame:** `requestFrame = cb => requestAnimationFrame(() => { cb(); engine.commit() })`. The Engine's `onDirty` covers renders outside a frame: init, the crash view, teardown ([How are Browser Effects handled natively?](https://github.com/giovannilondero/foldkit-native/issues/7)).
- **Mount:**
  - `AppRegistry.registerRunnable('main', …)` creates `new Engine(getFabricUIManager(), rootTag, { processColor, resolveAssetSource, conditions, tokens })`. `conditions` comes from `Dimensions`, `Appearance` and `PixelRatio`; `tokens` from `StyleSheet`.
  - It adds a host `view` with an `id`, styled `height: '100%'` and parented under `engine.root`.
  - It then boots `makeElement({ …, container: host, platform: fabricPlatform })` + `Runtime.embed`.
  - `dispose` runs when the host unmounts, which also covers Fast Refresh.
- **Dev warnings:** expect noisy Engine dev warnings unless `claimHost` / `declareNativeProps` are called. Silence them only if they get in the way.

## View API

The view API follows [What does a Foldkit Native view look like?](https://github.com/giovannilondero/foldkit-native/issues/6) ([prototype](https://github.com/giovannilondero/foldkit-native/tree/prototype/native-view-api/prototypes/view-api), variant B):

- A typed NativeBuilder `n`, with Foldkit's attribute array plus children array.
- Elements: `n.view`, `n.text`, `n.pressable`, `n.scrollView`, `n.textInput`, and nothing else until a demo needs it.
- RN-named PascalCase attributes. Raw strings are allowed only inside `n.text`.
- Typed RN inline `Style`.
- Wired as `nativeView(view)`, which gives `(model, _h) => view(model, n)`.

## Browser Effects

Following [How are Browser Effects handled natively?](https://github.com/giovannilondero/foldkit-native/issues/7):

- **Unsupported on native, left untouched:** routing/history, view transitions, `Dom.*` (focus, scroll lock, inert, dialogs), `Subscription.keyBindings` / `fromEvent` / `fromMediaQuery` / `animationFrame`, and scroll preservation. Calling one fails at call time and lands in Foldkit's crash view.
- **Boot:** `makeElement` + `Runtime.embed` only. `Runtime.run` throws on RN.
- **Document title/metadata:** a no-op (`manageDocument: false`).
- **Dev tooling:** every `import.meta.hot` gate (Model preservation, devtools bridge) stays off, because `babel-preset-expo` rewrites `import.meta` without `hot`. Keep `transformImportMeta` on (the default).

## The Spike app

`apps/spike` is one Foldkit app. Its Model holds the active demo as a `Data.TaggedEnum`, together with a menu screen and a "back" pressable, all drawn with `n`. There is no native navigation. Switching demos also exercises unmounting a subtree.

## Steps and success criteria

Every rung is verified by hand on an **iOS simulator and an Android emulator**. Each rung also gets one minimal **Node smoke test** that drives the vendored fake Fabric and asserts on the committed tree. There are no numeric performance thresholds.

| # | Step | Done when |
|---|---|---|
| S1 | **Fork:** create the private mirror `giovannilondero/foldkit` (plain clone; `upstream` = `foldkit/foldkit`, `origin` = the mirror; repo-local noreply identity), cut `platform-seam` from `75901568`, apply the change above | Foldkit's own suite passes on `platform-seam` |
| S2 | **Scaffold:** pnpm workspace, submodule, `packages/foldkit-native`, an `apps/spike` Expo SDK 57 dev client | The dev client builds and launches on both platforms |
| S3 | **Effect 4 on Hermes:** run an Effect program in the dev client (fibers, `Schedule`, `Stream`, `Data.TaggedEnum`), then import the fork and `embed` an app on a fake container | It runs on both platforms, and the list of polyfills it needed (e.g. `FinalizationRegistry`) is written down. **If it can't run even with polyfills, the Spike stops here** |
| 1 | **Counter** | Pressing an `n.pressable` increments and the `n.text` updates. There is one commit per frame |
| 2 | **Controlled text input** | Fast typing drops no characters and the cursor doesn't jump. A Model transform (uppercase) shows up in the field. The protocol (e.g. an event count like RN's `mostRecentEventCount`) is decided during the Spike |
| 3 | **Long list** | 1,000 keyed rows in an `n.scrollView`. Prepend and remove keep identity, and scrolling is usable. Virtualization gets added only if the plain scroll view doesn't hold up, and that design is decided during the Spike |
| 4 | **HTTP Command** | A GET of JSON shows loading, success and error states, including a forced network error. Check how RN's `fetch` handles response bodies with `FetchHttpClient` |
| 5 | **Subscription** | A small `Stream` over `AppState` in `packages/foldkit-native` drives a count of foreground/background transitions, with no Foldkit change. `Stream.tick` is the fallback if it fights back |
| 6 | **Styling via classes** | The counter is restyled through Tailwind classes, with `withTailwind(getDefaultConfig(...))` on the Expo Metro config and the ~300-line adapter from [Can ng-native's CSS/Tailwind pipeline serve Foldkit Native?](https://github.com/giovannilondero/foldkit-native/issues/4) |
| — | *Stretch:* navigation | Not specified. See Deferred |

Until rung 6, styling is inline `Style` only.

**The Spike succeeds when rungs 1–5 pass on both platforms.** Rung 6 and navigation are bonuses.

## Decided during the Spike, not before

- The controlled text input protocol (rung 2).
- Long lists: plain scroll view vs. virtualization, how keyed VNodes interact with recycling, and builder-level vs. a Submodel window (rung 3).
- What native does with a raw text node outside `n.text`. The builder makes this a compile error, but the Platform should still handle it safely.

## Deferred

These are explicitly not part of the Spike:

- **Browser Effects off the Ladder** (listed above). They stay unsupported.
- **The upstream PR:** a `run` that takes a Platform, the Platform provided as a `Context.Service` (like `RenderCommit`), a builder-generic `makeElement`, and making the fork public (rename the mirror first, then fork `foldkit/foldkit`).
- **Navigation:** native stacks, deep links, screen titles.
- **Devtools** from a device.
- **Testing story** beyond the smoke tests: scene tests, a contract test pinning the fake Fabric against the real Engine.
- **Native Commands** for focus, blur and keyboard dismissal.
- **Native Subscriptions** beyond `AppState`: color scheme, window size.
- **The ng-native config plugin** (UIScene, iOS 27 status bar).

Out of scope for Foldkit Native altogether: porting `@foldkit/ui`, third-party React components inside a view, a web target or SSR, animations and gestures, Expo Go, and hardware keyboard bindings.

## Known risks

- **ng-native churn:** alpha, seven releases in five days. Mitigation: the exact pin and the thin DOMAPI layer.
- **Node vs. Hermes:** the seam was validated in Node, not on Hermes. Step 0 covers this.
- **Metro and the pnpm workspace:** symlinks and a duplicated `foldkit` would trip the html runtime singleton's double-load guard. The fallback is the `pnpm pack` tarball.
