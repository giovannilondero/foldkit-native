# What contract does `@ng-native/fabric` offer a non-Angular renderer?

Research for issue #3. Question: what does `@ng-native/fabric` v0.3.0 expose, and what does it take
to drive it from Foldkit's snabbdom fork with no Angular in the bundle?

## Sources

All claims are cited against primary sources:

- **ng-native**: `https://github.com/ng-native/ng-native`, `main` at `9fe27df` (2026-10-02), cloned
  with `--depth 1`. Line numbers below refer to that commit. `main` is a few commits past the
  `v0.3.0` tag. I checked the 0.3.0 npm tarball's `dist/engine.d.ts`: every node-API signature
  quoted here matches it (e.g. `createElement` d.ts:634, `setEventListener` d.ts:722, `commit`
  d.ts:735, `setResponder` d.ts:1069).
- **Foldkit**: `https://github.com/foldkit/foldkit` at `0b2a4fd` (2026-10-01), for the vendored
  snabbdom fork under `packages/foldkit/src/snabbdom/`.
- The npm registry (`npm view @ng-native/fabric`) and the GitHub API, for release dates and churn.

Paths are relative to each repo root. `engine.ts` means `packages/fabric/src/engine.ts`.

## Short answer

`@ng-native/fabric` is a real, framework-agnostic engine. It has **zero runtime dependencies** (the
0.3.0 dist imports nothing outside itself) and a lint-enforced rule against importing Angular or
React Native (`docs/ARCHITECTURE.md:54-60`, `packages/fabric/src/index.ts:1-6`). Its public face is
a **DOM-like, mutation-style retained tree** (`Engine.createElement / appendChild / insertBefore /
removeChild / setProp / setText / setClasses / setEventListener`). An explicit `commit()` then
diffs that tree into Fabric's persistent, clone-on-write shadow tree. So snabbdom's mutation model
needs **no impedance matching at the structural level**. A custom `DOMAPI` is close to a 1:1
forward.

The gaps sit in what the engine leaves to the framework layer:

- **Snabbdom modules.** The stock modules call DOM methods on `elm` (`setAttribute`, `classList`,
  `style`, `addEventListener`) that engine nodes do not have. All five need engine-specific
  replacements.
- **`press`.** It is not a native event. The Angular `Pressable` directive synthesises it from the
  engine's responder API, and a Foldkit host has to reimplement it.
- **Controlled text input.** The `eventCount` / `mostRecentEventCount` echo protocol and the
  `setTextAndSelection` command live in the Angular `TextInput` directive.
- **Boot glue.** `mount()` lives in `@ng-native/platform` and is all Angular. The device helpers in
  `@ng-native/device` import `@angular/core`. A Foldkit `mount` is about 30-60 lines over `new
  Engine(...)`.
- **Batching.** One `commit()` per patch, plus a `requestAnimationFrame` pump only if CSS
  transitions are used.

API stability risk is **high**. The package is labelled alpha, it is five days old, and it shipped
seven npm versions in five days.

## 1. Package shape

- `@ng-native/fabric@0.3.0`: `"type": "module"`, published entry `dist/index.js` and `.d.ts`
  (`packages/fabric/package.json`, `publishConfig`). No `dependencies` and no `peerDependencies`.
  `grep "from '<bare>'"` over the 0.3.0 `dist/*.js` finds no external import.
- README: "No `@angular/core` import anywhere in it - that boundary is enforced by lint" and
  "Alpha: APIs may change before 1.0." (`packages/fabric/README.md`).
- Public exports are listed in `packages/fabric/src/index.ts:13-98`. The ones that matter here:
  - `Engine`, `SyntheticEvent`, `DIRECT_EVENTS`
  - `getFabricUIManager`
  - `registerViewName`, `registerPlatformComponents`, `nativePlatform`, `viewNameOf`
  - `claimHost`, `declareNativeProps`, `registerHoist`
  - `HostEngine` / `HostNode`
  - the CSS types (`StyleSheet`, `Conditions`, `TokenValue`)
  - the font hooks
- A narrower **`HostEngine` abstract class / `HostNode` interface** (`packages/fabric/src/host.ts:39-181`)
  is the "seam, measured rather than guessed" that the shared component packages use. It is the
  contract a second host (the web) implements. `Engine implements HostEngine`
  (`engine.ts:1619`).

## 2. The node API

All of these are methods on `Engine` (`engine.ts:1619+`). Nodes are `EngineNode`
(`engine.ts:404-503`), concretely a `RetainedNode` class (`engine.ts:1177-1325`) with public
mutable fields `kind: 'element'|'text'|'anchor'`, `name`, `props`, `text`, `children`, `parent`,
`listeners`, `classes`, and so on. `Engine.root` is the surface root (`engine.ts:1639`). It is
never committed itself, and its children become the root child set.

| Method | Signature | Line | Notes |
|---|---|---|---|
| constructor | `new Engine(fabric: FabricUIManager, rootTag: number, options?: EngineOptions)` | 1681 | Claims Fabric's single event handler eagerly (1703-1713). |
| `createElement` | `(name: string, sheet: StyleSheet \| null = null) => EngineNode` | 1987 | `name` is the element name (`'view'`, `'text'`...). `sheet` is the scoped stylesheet its rules match against. |
| `createText` | `(value: string) => EngineNode` | 2038 | `kind: 'text'`, committed as `RawText`. |
| `createAnchor` | `() => EngineNode` | 2034 | Ordered placeholder, never committed. Fits snabbdom's `createComment`. |
| `appendChild` | `(parent, child) => void` | 2044 | Detaches the child from its old parent first. |
| `insertBefore` | `(parent, child, ref: EngineNode \| null) => void` | 2053 | A `null` or missing `ref` appends. |
| `removeChild` | `(parent: EngineNode \| null, child) => void` | 2064 | Native views of a subtree still detached at commit are forgotten, and recreated if it is re-inserted (2087-2112). |
| `destroyNode` | `(node) => void` | 2158 | Optional teardown that clears listeners and animations. Angular calls it per destroyed node. |
| `parentNode` | `(node) => EngineNode \| null` | 2173 | |
| `nextSibling` | `(node) => EngineNode \| null` | 2177 | O(n) `indexOf` on the parent's children. |
| `setProp` | `(node, key: string, value: unknown) => void` | 2183 | `null` or `undefined` deletes the prop. `===`-equal values are skipped. `style` is a prop holding an RN style object. |
| `styleChanged` | `(node) => void` | 2231 | Tells the engine the node's own `style` object was mutated in place. |
| `setCustomProperty` | `(node, name: string, value: unknown) => void` | 2242 | `--tint` CSS tokens. |
| `setText` | `(node, value: string) => void` | 2255 | For text nodes. |
| `addClass` / `removeClass` | `(node, name: string) => void` | 1995 / 2000 | |
| `setClasses` | `(node, value: string) => void` | 2027 | Whitespace-split. Replaces the whole set. |
| `setEventListener` | `(node, topLevelType: string, fn: (event: unknown) => void) => () => void` | 2261 | Keyed by **Fabric top-level type** (`'topChange'`, `'topFocus'`, `'topLayout'`...), not DOM names. Returns a disposer. Auto-sets opt-in props such as `onLayout` (338-366). |
| `setResponder` | `(node, handlers: ResponderHandlers) => () => void` | 3625 | JS responder-system candidate. Sets `collapsable: false` on plain views (3661-3673). |
| `dispatchCommand` | `(node, name: string, args?: readonly unknown[]) => void` | 3675 | `focus`, `blur`, `scrollTo`, `setTextAndSelection`. Dropped if the node has never been committed. |
| `measure` | `(node, into: (frame: WindowFrame) => void) => void` | 3696 | `measureInWindow`. |
| `commit` | `() => boolean` | 2343 | Returns `false` and does nothing when the tree is clean. |
| `advanceAnimations` | `(now?: number) => boolean` | 3090 | Drives CSS transitions and keyframes. |
| `setOnDirty` / `setOnError` | `(fn) => void` | 3061 / 3066 | |
| `animating` / `pending` | getters | 3071 / 3082 | |
| `focused` | getter | 3747 | Node holding native focus, verified as still attached. |
| `updateConditions`, `updateTokens`, `remeasureText` | | 1975, 1793, 1809 | Rotation, theme, safe-area tokens, font scale. |

**There is no `addEventListener` on `Engine`.** The listener API is `setEventListener`.
`RetainedNode.addEventListener` exists (`engine.ts:1301-1316`), but it only accepts the four DOM
names Angular's `@defer` triggers use (`click`, `keydown`, `mouseenter`, `focusin`, mapped at
1108-1113). It **silently ignores every other name** (`if (!events) return;`, 1303). A renderer
that calls `elm.addEventListener('input', ...)` gets no error and no events.

`EngineOptions` (`engine.ts:1328-1387`) holds everything the engine refuses to import:

- `processColor`, `resolveAssetSource`, `nativeAnimated` (the React Native helpers)
- `globalStyles: StyleSheet`, `conditions` (for `@media`), `tokens`
- `dev` (defaults to `__DEV__`), `now`, `onDirty`, `onError`

### The Fabric binding (`FabricUIManager`)

`FabricUIManager` (`engine.ts:150-188`) is the slice of `global.nativeFabricUIManager` the engine
uses:

- `createNode(reactTag, viewName, rootTag, props, instanceHandle)`
- `cloneNodeWithNewChildren`, `cloneNodeWithNewProps`, `cloneNodeWithNewChildrenAndProps`
- `appendChild`, `createChildSet`, `appendChildToSet`, `completeRoot`
- optional: `registerEventHandler`, `setIsJSResponder`, `dispatchCommand`, `measureInWindow`

`getFabricUIManager()` (`packages/fabric/src/fabric.ts:48-67`) reads each method once off the
lazy JSI proxy into a plain object. If the global is missing, for example because New Architecture
is off, it throws. A compile-time check keeps the method list complete (`fabric.ts:20-46`).

## 3. Event payload shapes

- Fabric calls `(instanceHandle, topLevelType, nativeEvent)`. The `instanceHandle` is the
  `EngineNode` itself, passed at `createNode` (`engine.ts:3487-3488`).
- `dispatchEvent` (`engine.ts:3914-3936`) wraps the payload in
  `new SyntheticEvent(nativeEvent, target)`. Listeners receive `{ nativeEvent, target,
  stopPropagation(), isPropagationStopped() }` (`engine.ts:249-283`). **There is no `type` field.**
- Propagation: the engine bubbles target-to-root itself (`propagate`, `engine.ts:4000-4016`).
  Events in `DIRECT_EVENTS` (`engine.ts:206-238`) reach only the target: scroll, layout, load,
  `topTextLayout`, react-native-screens events and so on. Each listener runs inside its own
  try/catch, and errors go to `onError`. Nothing is rethrown into C++ (3900-3912).
- Touch: `TouchPayload` = `{ pageX, pageY, locationX, locationY, identifier, target, timestamp }`
  (`engine.ts:301-309`). `ResponderHandlers` follows RN's `onStartShouldSetResponder[Capture]`,
  `onMoveShouldSetResponder[Capture]`, `onResponderGrant/Move/Release/Terminate/TerminationRequest`
  plus `blockNativeResponder` (`engine.ts:313-327`). The engine runs RN's capture and bubble
  negotiation and calls `setIsJSResponder` (`runResponder`, 3860-3879).
- Typed payloads per event are declared in the Angular-side components package, but they are plain
  RN shapes (`packages/components/src/events.ts`):
  - layout `{ layout: {x,y,width,height} }`
  - scroll `{ contentOffset, contentSize, layoutMeasurement, contentInset, zoomScale, velocity? }`
  - text-input change `{ text, eventCount, target }`
  - focus/blur `{ target, eventCount?, text? }`
  - selection `{ selection: {start,end}, target }`
  - keyPress `{ key }`
  - switch `{ value, target }`
  - image load `{ source: {uri,width,height} }`
- **`press` does not exist natively.** The Angular adapter says so (`packages/platform/src/adapter.ts:51-58`).
  `Pressable` (`packages/components/src/pressable.ts:344-356`, 572 lines) builds press from
  `setResponder` plus retention offsets and measurement. A Foldkit host needs its own small
  Pressability.
- **Controlled text input is a framework-layer protocol.** Each native change carries `eventCount`.
  The framework writes it back as the `mostRecentEventCount` prop, alongside `text`. When the model
  diverges from what native last reported, it sends
  `dispatchCommand(node, 'setTextAndSelection', [count, text, -1, -1])` and then `remeasure`
  (`packages/components/src/text-input.ts:64-82, 268-283, 330-338`). The Demo Ladder's
  "controlled text input" rung depends on reimplementing this.

## 4. Commit and batching vs snabbdom

- The engine is **mutation-style on the outside and persistent inside**. Mutations only set dirty
  flags: `markProps`, `markStructure`, and `markPath` walking up (`engine.ts:2281-2327`).
- `commit()` (`engine.ts:2343-2381`) walks dirty paths and does three things:
  - **creates** nodes never committed (`create`, 3473-3496)
  - **clones** changed nodes with a props *diff* only (`cloneNodeWithNewProps`), or with new
    children (`cloneNodeWithNewChildren[AndProps]` + `appendChild`) (`clone`, 4029-4043)
  - **reuses** clean subtrees by handle (`reconcile`, 3196-3238)

  It then builds a fresh root child set and calls `completeRoot`. A changed child forces its
  ancestors to re-clone. That cost is inherent to persistent trees (3256-3262).
- Reuse is a correctness requirement. A full rebuild would drop scroll offset, cursor and focus
  (comment at `engine.ts:2336-2342`).
- The engine **never commits on its own** after a mutation. The host decides when. Angular's
  adapter commits once per change-detection pass (`RendererFactory2.end()`,
  `adapter.ts:481-493`, rule in `docs/ARCHITECTURE.md:62-67`). For changes made outside a pass,
  `onDirty` fires on the clean-to-dirty transition (`engine.ts:2318-2327`). The adapter then
  schedules a `requestAnimationFrame` pump that calls `advanceAnimations()` + `commit()` and
  repeats while `animating || pending` (`adapter.ts:442-470`). Some engine paths do commit
  themselves: focus changes (`setFocused`, 1729-1742), `updateTokens`, and responder teardown.
- **Mapping to snabbdom:** `patch()` already batches one view render. Calling `engine.commit()`
  in a module's `post` hook (`snabbdom/module.ts:17`), or right after `patch()` in Foldkit's
  renderer, gives exactly "one commit per render". Wire `onDirty` to a rAF pump only if CSS
  transitions or keyframes are used.

### Mapping a snabbdom `DOMAPI` (`packages/foldkit/src/snabbdom/htmldomapi.ts:8-42`)

| DOMAPI | Engine | Gap |
|---|---|---|
| `createElement(tag, data)` | `engine.createElement(tag, sheet)` | None. Also call `claimHost(node)` so dev mode does not report "used without importing Pressable/Text" (`checkClaimed`, `engine.ts:3498-3507`). Unknown names log in dev and render as `View` (3608-3618). |
| `createElementNS` | `createElement` | Namespaces are meaningless. Map to the same call. |
| `createTextNode` | `createText` | Text must sit inside a `text` element. Nothing guards against bare text under a `view`; native behaviour there is not verified. |
| `createComment` | `createAnchor` | None. |
| `insertBefore` / `appendChild` / `removeChild` | same names | None. Argument order matches. |
| `parentNode` / `nextSibling` | same names | `nextSibling` is O(siblings). Snabbdom calls it in `updateChildren`, so long keyed lists pay O(n²) in the worst case. |
| `tagName(elm)` | `node.tagName` / `node.name` | None. |
| `setTextContent(node, text)` | text node: `setText`. Element: remove children and append one `createText`. | Snabbdom calls it on elements for `h('text', 'hi')` (`init.ts:678-696`). |
| `getTextContent` | `node.text` | |
| `isElement` / `isText` / `isComment` | `node.kind === 'element' \| 'text' \| 'anchor'` | |
| `createDocumentFragment` / `isDocumentFragment` | none | Optional in the interface. Leave undefined. |

**Gap outside `DOMAPI`:** `createElm` calls `element.setAttribute('id' | 'class', ...)` directly
for `#id.class` selectors (`packages/foldkit/src/snabbdom/init.ts:222-230`), and `emptyNodeAt`
reads `element.id` and `getAttribute` (`init.ts:162-166`). Engine nodes have neither method, so
**`h('view.row')` throws**. Fix it in the fork (route through the API), or ban selector shorthand
on native.

### Mapping the module set

Foldkit's `patch` is `init([attributes, class, dataset, eventListeners, onUnmount, props, style])`
with the default HTML DOM API (`packages/foldkit/src/vdom.ts:27-35`). Every stock module writes to
`elm` through DOM methods, so **each needs a native twin**. The native `init` should also take a
custom DOMAPI.

- **attributes** (`attributes.ts:57-72` uses `setAttribute` / `setAttributeNS`): map to
  `engine.setProp(node, name, value)`, with removal as `setProp(node, name, null)`. Props
  containing `-` (`data-*`, `aria-*`) stay on the node for CSS selectors and never reach native
  (`mergeProps`, `engine.ts:2528-2539`). The Angular adapter parses a static `style="..."` string
  into an object (`adapter.ts:107-120, 160-166`).
- **class** (`class.ts:83-105`, `classList.add/remove`): map to `engine.addClass` /
  `removeClass`, or to `setClasses` for a raw string. Classes have no native meaning. They only
  feed the CSS cascade.
- **style** (`style.ts:61, 98, 119` writes `elm.style[name]`; `style.ts:157-163` uses
  `getComputedStyle` and `transitionend` for `remove` and `delayed`): map to `setProp(node,
  'style', {...camelCasedRNStyle})`. Values must be RN style values: numbers, not `'10px'`, and
  camelCase keys (the adapter converts both, `adapter.ts:62-91`). `--x` goes to
  `setCustomProperty`. Snabbdom's `delayed` and `remove` styles have no equivalent; the engine's
  own CSS transitions replace them.
- **props** (`elm[key] = value`, with a guard at `propsModule.ts:158`): on native, *props* and
  *attributes* are the same thing, `engine.setProp`. Collapse both modules into one.
- **eventlisteners** (`eventlisteners.ts:74-104`, `elm.addEventListener(name, listener)`; the
  handler looks up `on[event.type]` at `eventlisteners.ts:35-36`): map to
  `engine.setEventListener(node, 'top' + Capitalised(name), fn)` and keep the returned disposer,
  as the adapter does (`adapter.ts:59-60, 276-282`). The engine's events have **no `type`**, so the
  module must close over the name instead of reading `event.type`. `press` / `longPress` need a
  `setResponder`-based helper, not a listener.
- **dataset**: `data-*` via `setProp` (selector-only, as above).
- **onUnmount** (Foldkit's): the snabbdom `destroy` hook can call `engine.destroyNode` to free
  listeners and animations (`engine.ts:2158-2171`).

## 5. Native Elements: naming and props

- Element names are lowercase kebab-case strings mapped to Fabric component names in `VIEW_NAMES`
  (`engine.ts:512-532`):

  | Element | Fabric component |
  |---|---|
  | `view` | `View` |
  | `text` | `Paragraph` (`VirtualText` when nested in another `text`, 1084-1092; text nodes are `RawText`) |
  | `image` | `Image` |
  | `scroll-view` | `ScrollView` |
  | `safe-area-view` | `SafeAreaView` |
  | `modal` | `ModalHostView` |
  | `switch` | `Switch` |
  | `text-input` | `TextInput` |
  | `activity-indicator` | `ActivityIndicatorView` |
  | `refresh-control` | `PullToRefreshView` |
  | `input-accessory-view` | `InputAccessoryView` |
  | `pressable`, `touchable-opacity`, `image-background`, `keyboard-avoiding-view` | `View` |
  | `virtual-list` | `ScrollView` |

- Android renames five elements via `registerPlatformComponents('android')`
  (`engine.ts:585-593, 621-625`): `AndroidSwitch`, `AndroidTextInput`, `AndroidProgressBar`,
  `AndroidSwipeRefreshLayout`, and `View` for the safe-area and input-accessory views. **Call it
  once at boot with `Platform.OS`** (template `main.ts:11`).
- Any other name commits as `View` (`DEFAULT_VIEW`, `engine.ts:662`). Third-party Fabric
  components are added with `registerViewName(element, viewName | {ios, android}, defaultProps?,
  {textContent?})` (`engine.ts:800-822`).
- Props are a flat bag: whatever `setProp` wrote goes straight to native, except `style`, `-`-keys
  and the engine-internal keys. Merge precedence, weakest first, is: the RN-wrapper defaults the
  engine replicates (`DEFAULT_PROPS`, 637-648: ScrollView flex/overflow, Image overflow, Modal
  absolute, Paragraph ellipsize), then `defaultStyle`, matched CSS, explicit props, inline
  `style`, and `styleOverride` (`mergeProps`, 2510-2559).
- On the way out (`processed`, 3123-3141), props whose name ends in `color` go through
  `processColor`. `source` / `defaultSource` go through `resolveAssetSource`. Nested colours in
  `boxShadow`, `filter` and gradients are handled too.
- The components (`pressable`, `text-input` echo, `virtual-list` windowing, `scroll-view` content
  container, `keyboard-avoiding-view`, `safe-area`) are **Angular directives** in
  `@ng-native/components`. Their *native host* is in the engine. Their *behaviour* is not. For the
  Demo Ladder's long-list rung, `scroll-view` is native, but windowing would have to be written.

## 6. Booting without Angular

What the template does (`template/src/main.ts:1-31`):

1. `import 'expo'` (fetch with streaming body, URL, structuredClone).
2. `registerPlatformComponents(Platform.OS)`.
3. `AppRegistry.registerRunnable('main', ({rootTag}) => mount(Number(rootTag), App,
   getFabricUIManager(), { processColor, conditions: currentConditions(), tokens: deviceTokens(),
   resolveAssetSource: v => Image.resolveAssetSource(v) }))`.
4. `watchConditions(app.engine)`.

What `mount()` actually does (`packages/platform/src/adapter.ts:661-791`):

- **Angular-only parts:** the injector and providers, `createComponent`, `ApplicationRef`,
  `NativeRendererFactory`, the HMR reload hook, `installDeferTriggers`.
- **Engine parts, about ten lines:**
  - `new Engine(fabric, rootTag, {...options, nativeAnimated})`, with `nativeAnimated` from
    `react-native/src/private/animated/NativeAnimatedHelper` (628-641)
  - `engine.setOnDirty(scheduleFrame)` and `setOnError`
  - `engine.addClass(engine.root, 'platform-' + nativePlatform())`
  - create a host element, `engine.setDefaultStyle(host, { height: '100%' })`,
    `engine.appendChild(engine.root, host)`, render, `commit()`

A Foldkit `mount(rootTag, program)` therefore looks like this:

```ts
registerPlatformComponents(Platform.OS);
AppRegistry.registerRunnable('main', ({ rootTag }) => {
  const engine = new Engine(getFabricUIManager(), Number(rootTag), {
    processColor,
    resolveAssetSource: (v) => Image.resolveAssetSource(v as never),
    conditions: {
      width,
      height,
      colorScheme: Appearance.getColorScheme() ?? 'light',
      fontScale: PixelRatio.getFontScale(),
    },
    tokens: { '--hairline': { length: StyleSheet.hairlineWidth } },
  });
  const host = engine.createElement('view');
  engine.setDefaultStyle(host, { height: '100%' });
  engine.appendChild(engine.root, host);
  // patch(host-vnode, view(model)); engine.commit() after every patch
});
```

- `currentConditions`, `deviceTokens` and `watchConditions` live in `@ng-native/device`, which
  peers on and imports `@angular/core` (`packages/device/package.json` peerDependencies;
  `packages/device/src/color-scheme.ts:8`, imported by `conditions.ts:12-14`). **Do not import
  it.** Re-derive the values from `Dimensions`, `Appearance`, `PixelRatio` and `StyleSheet`
  (`conditions.ts:41-75` shows exactly which fields are needed).
- React itself stays in the bundle because RN's own JS imports it (`react` is a template
  dependency). It is out of the *render path*: the engine claims Fabric's single event handler in
  its constructor, precisely because `ReactFabric` installs one at module scope
  (`engine.ts:1703-1713`).
- **Polyfills.** `@ng-native/metro/polyfills/*` are three Angular-motivated globals:
  - `ng-dev-mode.js`, Angular only
  - `animation-globals.js`: `document`, `Node`, `AnimationEvent` for Angular `animate.*`.
    **Not needed, and actively risky for Foldkit**, which may feature-detect `document`.
  - `finalization-registry.js`: Hermes lacks `FinalizationRegistry`. Angular 22 needs it. Effect 4
    *might*; not verified.

  The engine itself needs only `requestAnimationFrame` (RN has it) and
  `performance.now` / `Date.now` (`engine.ts:1694`).
- **Metro preset (`packages/metro/config.cjs:529-626`)** is almost entirely Angular-coupled:
  - the Babel transformer runs the Angular compiler (`transformer.cjs:1-12`)
  - the transform worker, the `.html` / `.css` source extensions, the `@angular/core` singleton
    check, `ngDevMode` folding, and the polyfills
  - the package depends on `@angular/compiler` and `@oxc-angular/vite` (`packages/metro/package.json:20-26`)

  The reusable piece is **the CSS compiler**: `compileCss(source, context, {platform})` in
  `packages/metro/css/compile.cjs:1885`, exported at 2580-2590, produces the `StyleSheet` the
  engine takes as `globalStyles`. `@ng-native/tailwind`'s `withTailwind` uses it to emit a sheet
  module passed to `mount({ globalStyles })` (`packages/tailwind/config.cjs:1-33`). For the Spike,
  plain `expo/metro-config` with no ng-native Metro piece is enough. The engine ships as compiled
  ESM JS. Add `compileCss` later if Foldkit views want class-based CSS.
- **Config plugin (`packages/metro/app.plugin.cjs`)** has no Angular in it. It does two things:
  - adopts UIScene in Expo's AppDelegate, with a `SceneDelegate` (151-194)
  - swizzles `RCTStatusBarManager` because iOS 27 no-ops `UIApplication` status-bar setters
    (`AngularNativeStatusBar`, 84-150)

  It is framework-agnostic native glue, but it ships inside the Angular-heavy `@ng-native/metro`
  package. Either install the package only for `"plugins": ["@ng-native/metro"]`, which drags in
  `@angular/compiler` as a dependency, or copy the ~275-line MIT plugin. Neither change is needed
  to render.

## 7. Can the testing package's fake Fabric host a non-Angular renderer?

**Yes in substance, not as an import.**

- `createFakeFabric()` (`packages/testing/src/test-utils.ts:72`, 310 lines) depends only on
  `import type` from `@ng-native/fabric` (`test-utils.ts:5`). It provides:
  - `committed` / `render()` golden trees, `find`, `calls` counters
  - `emit(target, topLevelType, nativeEvent)` to drive the registered handler
  - `responderCalls`, `commands`, `frames` for `measureInWindow`
- ng-native's own engine tests drive `new Engine(createFakeFabric(), 1, ...)` directly with no
  Angular (`packages/integration-tests/engine-commit.test.ts:1-56`).
- But `@ng-native/testing`'s only JS entry is `.` → `index.ts`, which re-exports `render.ts`.
  That file imports `@angular/core` and `@ng-native/platform` (`packages/testing/src/index.ts:9-19`,
  `render.ts:8-18`). The package peers on `@angular/core` (`packages/testing/package.json:48-56`),
  and its `exports` map blocks a deep import of `test-utils`.
- So: **vendor `test-utils.ts`** (MIT) into Foldkit Native's test helpers. It gives node-level
  render tests of the snabbdom bridge with no simulator.

## 8. API stability risk

- "Alpha: APIs may change before 1.0." (`packages/fabric/README.md`).
- The repo was created 2026-09-27 (GitHub API). npm versions: 0.0.1 on 09-28; 0.1.0, 0.1.1 on
  09-29; 0.1.2, 0.1.3, 0.2.0 on 09-30; 0.3.0 on 10-02. That is **seven releases in five days**.
- 29 commits touched `engine.ts` between 2026-09-29 and 2026-10-02 (GitHub API). The fabric-path
  log shows near-daily semantic fixes (fonts, CSS tokens, keyframes, modal re-creation, touch
  re-enable). `main` was already past `v0.3.0` on release day (`d8ba434`, #371).
- The **node-mutation surface itself has been stable**. The method names and signatures in §2
  appear identically in 0.3.0's `dist/engine.d.ts`. `host.ts` (the `HostEngine` seam) has had one
  change since the initial commit (`5501f46`, 2026-09-30). Churn is concentrated in CSS, fonts and
  animation internals.
- Risks to plan for:
  - **Exact-pin** `@ng-native/fabric`.
  - Keep the snabbdom bridge behind a thin Foldkit-owned interface: the `HostEngine`-like subset
    from §2.
  - Many engine guards are tuned to Angular's call patterns. Examples: `checkClaimed` /
    `checkKnown` / `checkProps` dev warnings, `markComponentHost`, and comments assuming
    "Angular only calls setProperty when a binding actually changed" (`engine.ts:3214-3218`).
    Snabbdom's own diffing gives the same guarantee, but dev warnings will be noisy unless
    `claimHost` / `declareNativeProps` are called.

## Open points to verify in the Spike

- What native does with a `RawText` placed directly under a `View`, not inside `text`.
- Whether Effect 4 on Hermes needs `FinalizationRegistry`, or any other polyfill.
- Whether Foldkit's runtime touches `document` or `window` (Browser Effects) on the render path,
  which would need stubbing.
- `nextSibling` cost on keyed long lists under snabbdom's `updateChildren`.
