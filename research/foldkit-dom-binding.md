# Where is Foldkit bound to the DOM?

Research ticket: giovannilondero/foldkit-native#2. Vocabulary follows `CONTEXT.md` (Spike, Demo Ladder, Fabric Engine, Native Element, Browser Effect).

## Answer in one paragraph

Foldkit already contains most of the seam. Its vendored snabbdom takes a pluggable node API (`init(modules, domApi)`), and the event-handler payloads are duck-typed. The DOM is hard-wired in only a few places: one module-level `patch` built with the default `htmlDomApi`, the root mount/unmount code that calls DOM methods directly, and one `requestAnimationFrame` call. On top of that, a few bare `instanceof Element` checks crash on Hermes. The fix is a **`Platform` init option** (`{ domApi, modules, requestFrame }`), threaded from `makeElement`/`makeApplication` into the renderer. A Platform supplies its own snabbdom modules, so **none of the six DOM-calling snabbdom modules has to change**. They stay as the browser default. I built this seam in a scratch clone: **+177 / −81 lines across 10 files (one of them new)**. All 2878 Foldkit tests still pass. It boots a Demo Ladder app (counter, controlled text input, keyed list, HTTP Command, Subscription) against a fake tree shaped like `@ng-native/fabric`'s Engine, in a JS runtime with no `document`, no `Element` and no `MessageChannel`.

## Sources

- Foldkit `packages/foldkit` **0.165.0**, `git clone --depth 1 https://github.com/foldkit/foldkit` at commit `0b2a4fd` (2026-10-01). All `file:line` references below point at that commit, unmodified, unless marked "prototype".
- `@effect/platform-browser@4.0.0` and `effect@4.0.0` (Foldkit's pinned peer deps, `packages/foldkit/package.json:170-172`), from npm.
- `@ng-native/fabric@0.3.0` type declarations (`dist/engine.d.ts`, `dist/host.d.ts`), from npm.
- `react-native@0.87.1` `Libraries/Core/setUpGlobals.js` and `setUpTimers.js`, from npm.
- `babel-preset-expo@57.0.13` `build/index.d.ts` and `build/plugins/import-meta-transform-plugin.js`, from npm.
- Experiments (scratch, not in this repo): esbuild bundles with tree-shaking off (mimics Metro), evaluated in Node 26 with only the globals RN installs. Then a prototype branch of Foldkit, Foldkit's own vitest suite, and a fake Engine adapter. See [Evidence from running it](#evidence-from-running-it).

## 1. The DOM binding points

### 1.1 The module-level `patch` (`src/vdom.ts`)

- `vdom.ts:27-35`: `export const patch = init([attributesModule, classModule, datasetModule, eventListenersModule, onUnmountModule, propsModule, styleModule])`. No second argument, so snabbdom falls back to the browser API: `snabbdom/init.ts:117-136` (`init(modules, domApi?, options?)` … `const api = domApi !== undefined ? domApi : htmlDomApi`).
- `snabbdom/htmldomapi.ts:8-42` defines the `DOMAPI` interface (createElement, createTextNode, createComment, insertBefore, removeChild, appendChild, parentNode, nextSibling, tagName, setTextContent, getTextContent, isElement/isText/isComment). `htmldomapi.ts:44-69` is the only place that touches `document.*`.
- Root mount, `vdom.ts:151-163` (`patchFreshInto`): calls `container.parentNode`, `container.ownerDocument.createComment('')` and `parent.replaceChild(...)` directly, and `toVNode(container)` without a domApi (`snabbdom/tovnode.ts:18` accepts one).
- Patch-failure recovery, `vdom.ts:182-189`: `currentElement.parentNode.removeChild(...)` directly.
- Callers of the patch: `runtime/renderer.ts:233`, `:247`, `:282`, and `runtime/crashUI.ts:301`, `:324`. `hydrate.ts:28` also imports `patch`, but hydration is browser-only and can keep the browser patch.

**Fabric fit.** `@ng-native/fabric`'s `Engine` (`dist/engine.d.ts:634-735`) already has `createElement(name)`, `createText`, `createAnchor` (a comment equivalent; `NodeKind = 'element' | 'text' | 'anchor'`, `engine.d.ts:158`), `appendChild`, `insertBefore`, `removeChild`, `parentNode`, `nextSibling`, `setProp`, `setText`, `setClasses`, `setEventListener(node, topLevelType, fn) => teardown` and `commit()`. That maps almost one-to-one onto snabbdom's `DOMAPI`. Note: the engine method is `setEventListener` and returns a teardown. It is not `addEventListener`.

### 1.2 The snabbdom modules that call Element methods directly

These ignore `DOMAPI` and treat `vnode.elm` as a DOM `Element`:

| Module | Direct DOM use |
|---|---|
| `snabbdom/class.ts:62-105` | `elm.classList.contains/add/remove` |
| `snabbdom/dataset.ts:10-41` | `elm.dataset`, `elm.setAttribute/removeAttribute('data-…')` |
| `snabbdom/eventlisteners.ts:52-104` | `elm.addEventListener/removeEventListener(name, listener, false)`. Dispatch is keyed on `event.type` (`:35-42`) |
| `snabbdom/attributes.ts:49-99` | `setAttribute(NS)` / `removeAttribute(NS)` |
| `snabbdom/style.ts:18-22` | Module-level `window.requestAnimationFrame` bind. `:36-40` `style.setProperty/removeProperty`. `:54-119` `elm.style`. `:157-164` `getComputedStyle` + `transitionend` (remove hook with `style.remove` only) |
| `propsModule.ts:99-229` (Foldkit's own, replaces snabbdom props) | `elm instanceof Element` (`:115`, `:162-226`) and arbitrary `elm[key] = value` |
| `snabbdom/init.ts:223,226` | `element.setAttribute('id'/'class')`, only for `tag#id.class` selectors, which Foldkit's `h` never builds |

**Recommendation: leave all of them untouched.** snabbdom's own extension mechanism is the module list, and the Platform supplies its own list (one module each for attrs, class, on, props and style, written against the Fabric Engine). `onUnmountModule` (`onUnmountModule.ts`) is DOM-free and has to be included. Order matters: attrs before props (`vdom.ts:20-26`). The modules have the shape `{ create, update, destroy, dataMask }` (`snabbdom/module.ts`). A native module should set the same `VNodeDataMask` so that `init.ts:227-240` keeps skipping work.

### 1.3 `requestAnimationFrame` batching

- `runtime/renderer.ts:712-724` (`scheduleRenderFrame`): calls `requestAnimationFrame(renderFramePlain)` with no cancel handle. **This is the render batching.** Messages mark at most one pending frame.
- `render/render.ts:5-10` and `:24-32` (`Render.afterCommit` / `afterPaint`): a rAF fallback used only when no commit is pending. Inside a runtime it waits on the `RenderCommit` service (`render/commit.ts:21-27`).
- React Native defines `requestAnimationFrame` as a JS timer (`setUpTimers.js:82`), so neither call crashes on RN. The reason to put the renderer's call behind `Platform.requestFrame` is ownership: the Fabric Engine batches, and someone must call `engine.commit()` after each frame's patch. A `requestFrame` that runs `cb(); engine.commit()` does that with no further Foldkit hook. The `EngineOptions.onDirty` callback (`engine.d.ts:431-438`) covers renders outside a frame (the init render, the crash view, teardown). `render/render.ts` can stay untouched for the Spike.

### 1.4 `runtime/renderer.ts`

Besides the patch calls (§1.1) and rAF (§1.3):

- `:131` `container: HTMLElement` (type only).
- `:272-297` teardown finalizer: `placeholderNode.parentNode.replaceChild(container, placeholderNode)` and `container.replaceChildren()`. These are direct DOM calls and need to go through `DOMAPI`.
- `:476-478` `applyDocumentMetadata`, only when `manageDocument` is true (`makeApplication`).
- `:598-658` View Transitions, only when `viewTransition` is configured.
- `:480-482` `duplicateIdScanner`, only under `import.meta.hot`.

### 1.5 Booting: `runtime/start.ts`, `BrowserRuntime`, `browserScheduler`

- `start.ts:3` imports the `@effect/platform-browser` barrel. `start.ts:86-104`: `run`/`hydrate` go through `BrowserRuntime.runMain`, which calls `globalThis.addEventListener("pagehide", …)` (`@effect/platform-browser@4.0.0 dist/BrowserRuntime.js:34`). React Native 0.87.1 defines no global `addEventListener` (no match in `Libraries/` or `src/`), so **`Runtime.run` throws on RN**.
- `start.ts:211-287` (`embed`): uses `Effect.runFork(withUnhandledCauseReporting(provideBrowserScheduler(...)))` (`:268-270`). There is no `runMain` and no `pagehide`. **`Runtime.embed` works on RN with no change**, and its `dispose` handle is exactly what a host needs.
- `runtime/browserScheduler.ts:12-30`: a `MixedScheduler` over `queueMicrotask`. RN provides `queueMicrotask` (`setUpTimers.js:89`). **Leave untouched.**
- `runtime/makeApplication.ts:287`: always calls `findDocumentHydration` → `hydrationHandoff.ts:322-324` `document.querySelectorAll(...)`, which **throws on RN**. Also `:316` `manageDocument: true` → document `<head>` writes. `runtime/makeElement.ts:190-214` has neither (`manageDocument: false`, no hydration lookup).
- `runtime/runtime.ts:369-371` / `:388-396`: the runtime requires `container.id` (it is the runtimeId for Model preservation). A native container node must carry an `id` field.
- `vdom.ts:156-158`: if the container has no parent, the new root is never inserted. The native adapter must mount a container node under the Fabric root, not use the root itself.

So for the Spike, **`makeElement` + `Runtime.embed` avoids every boot-path Browser Effect without touching `start.ts`**. For an upstream PR, `makeApplication` should skip hydration and document metadata when a Platform is given (prototype: +10/−2 lines). Optionally, `run` could take a Platform and use `Effect.runFork` (about 6 lines, not prototyped).

### 1.6 The html runtime singleton (`html/runtimeSingleton.ts`)

It is DOM-free: a module-level frame stack (`:35`) holding dispatch, the Effect context and the Submodel boundary registry, pushed and popped around each `view` call (`setRuntime` `:61-75`, `clearRuntime` `:122-132`, called from `renderer.ts:395-407`). It is platform-neutral, so **leave it untouched**. One caveat: `:37-48` throws if Foldkit is loaded twice, which a Metro config that duplicates `foldkit` and `@foldkit/ui` would trigger.

### 1.7 Event attribute payloads (`html/index.ts`)

The handlers read events by duck typing, so a Platform's event module can pass a synthesized plain object:

- `OnInput` / `OnChange` (`:1845-1853`) → `inputEventValue(event.target)` (`:165-185`), which uses `Predicate.hasProperty(target, 'value')` and does no `instanceof`. Pass `{ target: { value: text } }`.
- `OnClick` (`:1655-1670`) calls `preventDefault`/`stopPropagation` only with options. With `focusSelector` it uses `document.querySelector` + `instanceof HTMLElement`, which is a Browser Effect off the default path.
- `OnSubmit` (`:1891-1897`) calls `event.preventDefault()`. `OnScroll` (`:1900-1904`) reads `event.target.scrollTop`.
- The snabbdom listener routes on `event.type` (`eventlisteners.ts:35-42`), so the synthesized event must carry the **Foldkit** name (`'click'`, `'input'`), not the Fabric name (`'topPress'`, `'topChangeText'`). The name mapping belongs in the adapter, not in Foldkit.

**What does need a Foldkit change.** Controlled props (`h.Value`, `h.Checked`, `h.Selected`, `h.Open`) write `props.value` **and** register a view-time insert/postpatch hook (`updatePropsWithPostpatch` `:1548-1555`, `attachPostpatchHook` `:2713-2730`, wired at `:2818-2823`). That hook runs `applyControlledProps` (`:2688-2711`), which evaluates `vnode.elm instanceof Element`. On Hermes `Element` is not a global, so this throws `ReferenceError: Element is not defined` for the controlled-text-input demo. The prototype reproduced it (§4). The fix is one guarded helper, `isDomElement = v => typeof Element !== 'undefined' && v instanceof Element`, replacing all 12 `instanceof Element` sites in `html/index.ts` (+17/−12). The other 11 sites (`:194`, `:197`, `:1987-2046` drag zones, `:2514-2535` OnMount, `:2744` select/textarea ownership) are off the Ladder, but they have the same hazard.

The controlled-input semantics stay the adapter's job. In the browser, the postpatch hook re-asserts the value by reading the live `elm.value`. On native, that hook only writes a plain JS field on the EngineNode, which does nothing. The native props module must remember the last text native reported (from `topChangeText`) and re-send `setProp('value', …)` when the Model disagrees, which is what RN's own controlled `TextInput` does.

**Tag vocabulary.** No change is needed for the Spike. The adapter's `domApi.createElement` maps HTML tags to Native Elements (`div→view`, `p/span→text`, `button→pressable`, `input→text-input`). A free-form tag builder exists (`html/index.ts:3220` `customElement`), but it is only exposed through `CustomElement.define`, which requires a hyphenated tag (`customElement/index.ts:301`). The prototype tree also shows raw text nodes directly under `pressable`/`view`. RN only allows raw text inside `<Text>`, so the adapter has to wrap them or map the parent to `text`. That is an adapter concern.

## 2. Browser Effects on the Demo Ladder code path

Metro does not tree-shake, so import closure is what counts. Measured with esbuild bundles with tree-shaking off:

- The `foldkit` root index (`src/index.ts`) pulls in **162 Foldkit modules**, including Canvas, Calendar, File, Route, and `test/scene`/`test/story`.
- Subpath imports (`foldkit/runtime`, `/html`, `/command`, `/subscription`, `/message`, `/struct`) pull in **103**. `start.ts:3` brings in the whole `@effect/platform-browser` barrel (BrowserHttpClient, IndexedDb, Geolocation, Clipboard, …).
- **All of it evaluates at import time with no DOM globals.** Both bundles load in Node with no `window`/`document`/`Element`/`requestAnimationFrame`. So the import-time hazard is zero, and every DOM touch is at call time.

### Executed on the Ladder path (must be safe or behind the seam)

| Browser Effect | Where | On RN | Action |
|---|---|---|---|
| DOM node creation and patch | `vdom.ts:27-35`, `:151-189`; `htmldomapi.ts:44-69` | `document` undefined → crash (first failure observed) | **Seam** (`Platform.domApi` + `modules`) |
| Container restore on dispose | `renderer.ts:286-293` | DOM methods on a non-DOM node | **Seam** (via `domApi`) |
| Controlled-prop hook `instanceof Element` | `html/index.ts:2699`, `:2707` | `ReferenceError` | **Guard** (`isDomElement`) |
| Render batching `requestAnimationFrame` | `renderer.ts:723` | Exists (timer) | **Seam** (`Platform.requestFrame`) so the adapter can `engine.commit()` |
| Deferred drain over `MessageChannel` | `messageQueue.ts:80-92`, triggered past `DRAIN_BUDGET_MS = 5` (`:5`, `:115-137`) | No `MessageChannel` in RN → crash under bursts (long list) | **Fallback** to `setTimeout(0)` (+11 lines) |
| `BrowserRuntime.runMain` `pagehide` | `start.ts:92` | No global `addEventListener` → crash | Avoid: use `Runtime.embed` (`start.ts:268`) |
| `findDocumentHydration` | `makeApplication.ts:287` → `hydrationHandoff.ts:322-324` | `document` undefined → crash | Avoid: use `makeElement`, or skip when a Platform is given |
| Document `<head>` metadata | `renderer.ts:476-478`, `crashUI.ts:306-308` | crash | Avoid: `manageDocument` false (`makeElement`, or Platform given) |
| DevTools visibility check `window.self !== window.top` | `devToolsConfig.ts:118-131` (every boot) | Safe: RN sets `window = self = globalThis` (`setUpGlobals.js:18-31`) | None |
| `import.meta.hot` gates (Model preservation, scroll preservation, DevTools, WebSocket bridge, duplicate-id scanner, key warning) | `runtime.ts:316`, `:352-358`; `modelPreservationBridge.ts:35-41`; `devToolsIntegration.ts:251-258`; `renderer.ts:480`; `snabbdom/init.ts:113-114` | `babel-preset-expo` rewrites `import.meta` to `globalThis.__ExpoImportMetaRegistry` by default (`build/index.d.ts:36-43`, `transformImportMeta` default `true`). It has no `hot`, so every gate stays off | None (dev tooling is simply off) |
| `queueMicrotask` scheduler | `browserScheduler.ts:12-30` | Exists | None |
| `snabbdom/style.ts:18-22` module-level rAF bind | import time | Safe (`window` exists) | None |
| HTTP Command | `http/http.ts:46-49` → `effect/http` `FetchHttpClient` | `fetch` exists | None. Verify response body handling on RN fetch in the Spike |
| Subscription streams | `runtime/subscriptionFibers.ts`, `subscription/subscription.ts` | DOM-free | None |

### Imported but only executed when used (leave untouched)

URL routing and link interception (`runtime/browserListeners.ts`: `popstate`, `document` click; wired only when `routing` is set, `runtime.ts:601-609`, `makeApplication.ts:308-310`). View Transitions (`runtime.ts:333-350`, `renderer.ts:598-658`). Scroll preservation (`runtime/scrollPreservation.ts`, gated on hot and `manageDocument`). `Subscription.animationFrame` / `fromEvent` / `fromMediaQuery` / `keyBindings` (imported by `subscription/public.ts`). `Dom.*` helpers (focus, scroll lock, inert, dialogs; the `DialogRuntime` finalizer iterates an empty set, `runtime.ts:653-660`). `hydrate.ts`, the hydration refusal shield, `devTools/webSocketBridge.ts`, `Render.afterCommit`/`afterPaint`'s rAF fallback, and OnClick's `focusSelector`. Also off the Ladder: OnFocusEnter/Leave's `instanceof Node` (`html/index.ts:198`), which is not covered by the guard.

## 3. The seam

### Shape: an init option, not an Effect service

```ts
// src/platform.ts (new, 41 lines incl. the browser default)
export type Platform = Readonly<{
  domApi: DOMAPI                                  // snabbdom node ops
  modules: ReadonlyArray<Partial<Module>>         // complete list, must include onUnmountModule
  requestFrame: (callback: () => void) => () => void
}>
export const browserPlatform: Platform = { domApi: htmlDomApi, modules: [attributesModule, classModule, datasetModule, eventListenersModule, onUnmountModule, propsModule, styleModule], requestFrame: … }
```

```ts
Runtime.makeElement({ Model, init, update, view, container, platform: fabricPlatform })
Runtime.embed(program)   // no BrowserRuntime.runMain
```

Why a config field rather than an Effect `Context.Service`: the renderer needs the platform synchronously while it is being built (`makeRenderer`), and `run`/`embed` own the root fiber, so an app has nowhere to `provideService` except the `resources` Layer, which is for Command services. It also matches how every other runtime capability is configured (`viewTransition`, `crash`, `slow`, `devTools`). An upstream PR could additionally provide the chosen Platform as a `Context.Service` inside the runtime, like `RenderCommit` (`render/commit.ts:17-27`), so that `Render.afterCommit` and `Dom.*` can use its frame clock. That is about 12 more lines and is not needed for the Ladder.

### Changes, sized (prototype diff against `0b2a4fd`)

| File | +/− | Change |
|---|---|---|
| `src/platform.ts` (new) | +41 | `Platform` type, `browserPlatform` default (the current module list, in the current order) |
| `src/vdom.ts` | +63/−49 | `makePatch(platform)`. `patch` stays exported as the browser patch (hydrate.ts keeps using it). `makeVdom(platform)` → `{ patchVNode, recoverVNodeAfterPatchFailure }`. `patchFreshInto`/recovery go through `domApi`. `__patchVNode`/`__recover…` stay as browser-bound aliases |
| `src/runtime/renderer.ts` | +16/−15 | Accept `platform`, `const vdom = makeVdom(platform)`, teardown via `domApi`, `platform.requestFrame(renderFramePlain)`, pass `vdom.patchVNode` to the crash view |
| `src/runtime/crashUI.ts` | +4/−3 | Optional `patchVNode` parameter (defaults to the browser one) |
| `src/runtime/runtime.ts` | +5 | `platform?: Platform` on `RuntimeConfig`, default `browserPlatform`, forwarded to `makeRenderer` |
| `src/runtime/makeElement.ts` | +4 | `platform?` option, forwarded |
| `src/runtime/makeApplication.ts` | +10/−2 | `platform?` option; when present, skip `findDocumentHydration` and set `manageDocument: false` |
| `src/runtime/messageQueue.ts` | +11 | `setTimeout(0)` fallback when `MessageChannel` is undefined |
| `src/html/index.ts` | +17/−12 | `isDomElement` guard for the 12 `instanceof Element` sites |
| `src/runtime/public.ts` | +6 | Export `Platform`, `browserPlatform`, `onUnmountModule`, and the `DOMAPI`/`Module`/`VNode` types |
| **Total** | **+177/−81** | 10 files. About 100 net lines. The `vdom.ts` count is inflated by moving code into a factory |

**Untouched:** every file under `src/snabbdom/` (`class`, `dataset`, `eventlisteners`, `attributes`, `style`, `init`, `htmldomapi`, `tovnode`), `propsModule.ts`, `render/render.ts`, `render/commit.ts`, `runtime/start.ts`, `runtime/browserScheduler.ts`, `html/runtimeSingleton.ts`, and everything under `command/`, `subscription/`, `http/`, `dom/`, `hydrate.ts`.

**Smallest Spike subset:** skip the `makeApplication.ts` change and the 10 off-Ladder `isDomElement` sites. That leaves about 150 changed lines.

### What the native side supplies (outside Foldkit, in foldkit-native)

A `DOMAPI` over `Engine` (about 30 lines: tag mapping, `createComment → createAnchor`, `setTextContent` via `setText`/children). Five modules (attrs/props → `setProp`, class → `setClasses`, on → `setEventListener` with synthesized `{ type, target: { value, scrollTop }, preventDefault, stopPropagation }`, style → `setProp('style', …)`). The probe versions are about 60 lines. Production ones will be larger: style units, controlled-input reconciliation, text-in-`<Text>` rules. Plus `requestFrame: cb => requestAnimationFrame(() => { cb(); engine.commit() })` and a container node with an `id`, parented under the Fabric root.

### Rejected alternative: a DOM shim, zero fork

Polyfill `globalThis.document`/`Element`/`Node` and return facade nodes implementing `classList`, `dataset`, `style.setProperty`, `setAttribute(NS)`, `addEventListener`, `replaceChild`, `replaceChildren`, `ownerDocument`, `getAttribute` and arbitrary property writes (`propsModule.ts` `writeProperty`). That emulates roughly 30 DOM members behind `instanceof` checks, it breaks silently as Foldkit evolves, and it cannot go upstream. The seam is smaller.

## 4. Evidence from running it

1. **Import-time safety.** The root-index bundle (162 modules) and the subpath bundle (103) both evaluate in Node 26 with no DOM globals.
2. **First crash without the seam.** `makeElement` + `embed` with a fake container and RN-like globals (`window = globalThis`, timer rAF) fails with `ReferenceError: document is not defined` at `htmldomapi.createElement ← createElm ← patch ← patchFreshInto ← __patchVNode`.
3. **With the seam.** In the same environment, plus `MessageChannel` deleted, a fake Engine-shaped tree (the `Engine` method set above) and a 60-line adapter:
   - The init render produces `<view .screen> <text>"count 0"</text> <pressable on=topPress>…<text-input {"value":""} on=topChangeText> … <scroll-view> <view>"1"…`.
   - Two `topPress` events give `"count 2"`, and the keyed list prepends `11, 10` before `1, 2, 3`.
   - `topChangeText {text:'hello'}` → `OnInput` → Model uppercases → `text-input {"value":"HELLO"}`.
   - A `fetch` press runs a `Command.define` whose Effect uses `HttpClient` from `Foldkit.Http.layer` against a local HTTP server, and `"greeting hi from http"` renders.
   - A `Subscription.make` entry over `Stream.tick` drives a counter.
   - `handle.dispose()` restores the bare container under the root.
   - Before the `isDomElement` guard, this run crashed with `ReferenceError: Element is not defined` in `applyControlledProps` (and the default crash view rendered natively through the seam).
4. **No regression.** Foldkit's own suite (`vitest run`, happy-dom) on the prototype branch: **105 files passed, 1 skipped; 2878 tests passed, 1 skipped**. `tsc -p` over `src/index.ts` and `runtime/public.ts` reports no new errors. The only errors are the existing `import.meta.hot` ones from missing vite types.

## 5. Open points for the Spike

- Node is a proxy for Hermes. Bundle with Metro and run on Hermes early to catch engine-level gaps (Effect 4 on Hermes, `Intl`, regex features). `babel-preset-expo`'s `transformImportMeta` must stay on (it is on by default; with it off, `import.meta` is a hard error on native, per `import-meta-transform-plugin.js`).
- Controlled `TextInput` reconciliation (§1.7) and raw text outside `<Text>` are adapter design questions, not Foldkit ones.
- RN's `fetch` and `FetchHttpClient`: check response body and streaming support for the HTTP Command demo.
- The seam does not add a cleanup hook to `Platform`. Event listener teardown goes through the module `destroy` hooks, and Engine node release (`destroyNode`) may need an adapter-side `destroy` module hook.
