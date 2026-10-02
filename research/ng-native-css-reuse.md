# Can ng-native's CSS/Tailwind pipeline serve Foldkit Native?

Research for [#4](https://github.com/giovannilondero/foldkit-native/issues/4). Blocks #6.

## Answer

**Reusable with a known adapter.** The build-time CSS compiler, the Tailwind step and the CSS
runtime in the Fabric Engine do not depend on Angular. The Angular parts are per-component sheet
scoping and a few runtime helpers, and Foldkit Native doesn't need any of them. A Foldkit Native
app can:

1. run `withTailwind` on a plain Expo Metro config. It scans `.ts` view files for class strings and
   writes a JS module holding the compiled `StyleSheet`;
2. pass that module to `new Engine(fabric, rootTag, { globalStyles, conditions, tokens })`;
3. turn Foldkit's `Class` into `engine.setClasses` and Foldkit's `Style` into
   `engine.setProp(node, 'style', …)` / `engine.setCustomProperty`.

The adapter is about **250–350 lines of TypeScript and no build code**. Most of it is ported from
`@ng-native/platform` and `@ng-native/device`, which are coupled to Angular (see
[Adapter](#the-adapter-and-its-size)). The commit and animation pump inside it is needed by the
Foldkit Native renderer anyway, CSS or not.

I verified this end to end in Node with the published `0.3.0` packages, without loading any
Angular module (see [Probe](#probe-run-without-angular)).

## Sources

- ng-native at `9fe27df8f7724c68e0ac815301d102f2a7b38b35` (2026-10-02). Paths below are relative
  to `packages/`. Published packages: `@ng-native/{fabric,metro,tailwind,device}@0.3.0` (npm).
- foldkit at `0b2a4fd04171afa8c8911d22aa9bec2f22faae52` (2026-10-01), `packages/foldkit/src/`.
- ng-native docs: `apps/documentation/src/content/packages/fabric/{css-engine,supported-css,animation}.md`,
  `docs/ARCHITECTURE.md`.

## How the pipeline is built

```
styles.css ──(Tailwind CLI, scans sources)──▶ out.css ──flattenTailwind──▶ compileCss (lightningcss)
   ──▶ JS module `export default { rules, keyframes, fonts }`   (build time, Node)
                                    │
mount/new Engine({ globalStyles }) ─┘──▶ StyleResolver: match + cascade per node per commit
   ──▶ Engine.mergeProps: cascade ⊕ inline style ⊕ transitions ──▶ Fabric props   (runtime)
```

Angular-component CSS takes a separate route through the same compiler.
`metro/angular-transform.cjs:16,768` calls `compileCss` on each component's `styles`/`styleUrl`
and attaches the result to the class as `ɵnativeStyles` (`fabric/src/css.ts:2973-2978`).

## What is coupled to Angular, and what is not

| Piece | Angular-coupled? | Evidence |
| --- | --- | --- |
| `@ng-native/metro` **CSS compiler** `css/compile.cjs` (`compileCss`) | **No.** It requires only `lightningcss` and its sibling files. It removes Angular's `_ngcontent-`/`_nghost-` attributes from selectors and otherwise ignores them | `metro/css/compile.cjs:8-45` (requires), `:47-48`, `:871-873` (NG_ATTR stripped), `:1885` (signature `compileCss(source, context, options)`), `:2580` (exported) |
| `@ng-native/metro` **Angular transformer** `angular-transform.cjs` (AOT via `@oxc-angular/vite`, `ɵnativeStyles`, HMR) | **Yes.** Foldkit does not need it | `metro/angular-transform.cjs:16-24,150-160,768`; `metro/README.md` |
| `withAngularNative` Metro preset | Yes, and not needed. `withTailwind` reads only `config.projectRoot` from it | `tailwind/config.cjs:47-48` |
| `@ng-native/tailwind` `withTailwind` / `compileSheetModule` | **No.** It runs the app's own Tailwind CLI, flattens the output, calls `compileCss`, and writes a `.js` module plus a `.d.ts` typed as fabric's `StyleSheet` | `tailwind/config.cjs:31-32,47-73,151-195` |
| Tailwind preset `native.css`/`shared.css` | No. It is plain CSS: `@custom-variant ios (.platform-ios &)`, `dark (.dark &)`, `hover` → `:active`, `pt-safe` reads `var(--safe-area-inset-top)` | `tailwind/shared.css:31-35,45,63,79-110`; `tailwind/native.css:31-33` |
| Fabric Engine CSS runtime (`css.ts`, `StyleResolver`) | **No**, and the project enforces this with a lint rule | `fabric/src/css.ts:1-7`; `fabric/src/index.ts:1-11`; `docs/ARCHITECTURE.md` "The engine never imports Angular or React Native" (lint-enforced by `bannedExternalImports`) |
| Per-component **scoping** (emulated encapsulation, `:host`, `styleUrls`, `ViewEncapsulation.None`) | Yes, but this lives in the **platform adapter**, not the engine. The engine only sees a `sheet` per node (`createElement(name, sheet)`), a `hostSheet`, and `addGlobalSheet` | `platform/src/adapter.ts:300-360` (`createRenderer`/`scopedSheetOf` read the component def and `encapsulation`); `fabric/src/engine.ts:1773-1791,1987-2018` |
| `mount()` (bootstraps Angular, adds `platform-<os>` root class, drives the commit and rAF pump) | **Yes** (`@angular/core` DI, `createComponent`, `ApplicationRef`) | `platform/src/adapter.ts:661-760`; root class `:744`; pump `:432-484` |
| `@ng-native/device` (`currentConditions`, `deviceTokens`, `watchConditions`) | **Yes, through imports.** `conditions.ts` itself is framework-free, but it imports `color-scheme.ts`, `screen.ts` and `accessibility.ts`, and all three import `@angular/core`. The package also has a peer dependency on `@angular/core` | `device/src/conditions.ts:11-15,41-126`; `device/src/color-scheme.ts:8`; `device/src/screen.ts:17`; `device/src/accessibility.ts:20`; `device/package.json` peerDeps |
| Safe-area insets → `--safe-area-inset-*` tokens | Yes (it is an Angular component). The mechanism underneath is not: listen to the native provider's `insetsChange` and call `engine.updateTokens` | `components/src/safe-area-provider.ts:40-43,72-80` |

Install-weight caveat: `@ng-native/metro@0.3.0` lists `@angular/compiler` and `@oxc-angular/vite`
as **dependencies** (npm registry; `metro/package.json:20-26`), and `@ng-native/tailwind` depends on
`@ng-native/metro`. Both are installed but neither is loaded on the CSS path, and they run in Node
at build time, so they never reach the app bundle. `@ng-native/metro` has no `exports` map and
ships `css/*.cjs` (`metro/package.json:19,54-58`), so the deep `require` that `tailwind/config.cjs:31`
uses also works for an app that wants to call `compileCss` directly.

## Can a global stylesheet be compiled and loaded without Angular?

Yes. Tailwind's docs show this setup (`tailwind/README.md`). With Angular removed it becomes:

```js
// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const { withTailwind } = require('@ng-native/tailwind/config.cjs');
module.exports = withTailwind(getDefaultConfig(__dirname), { input: './styles.css' });
```

```css
/* styles.css */
@import 'tailwindcss/theme.css';
@import 'tailwindcss/utilities.css';
@import '@ng-native/tailwind/native.css';
/* any hand-written global CSS can go here too; it passes through the CLI and the same compiler */
```

```ts
import sheet from './.angular-native/app.tailwind.js';
const engine = new Engine(getFabricUIManager(), rootTag, {
  globalStyles: sheet, conditions, tokens, processColor, resolveAssetSource,
});
```

- The output has to be `.js`, because Expo's transform worker returns an empty module for every
  `.css` file on native (`tailwind/config.cjs:38-56`). The path defaults to
  `.angular-native/app.tailwind.js` and can be changed with `output` (`:35,50`).
- Class scanning: the CLI's own source detection does the scan (`tailwind/config.cjs:16-18`).
  Tailwind 4 scans `.ts` files, so string literals in `h.Class('…')` are picked up, including both
  branches of a ternary (confirmed in the probe). As on the web, a class assembled at runtime
  (`` `bg-${c}-500` ``) is not found. Tailwind 3 needs `content: ['./src/**/*.ts']`.
- Dev loop: `withTailwind` runs `tailwindcss --watch` and regenerates the module whenever the CSS
  changes (`tailwind/config.cjs:70,265-326`). Metro then reloads that module. Swapping the sheet
  without a remount would need `addGlobalSheet(next, previous)` (`fabric/src/engine.ts:1773-1780`)
  rather than the constructor option, which is fixed once set (`fabric/src/css.ts:1168,1205-1207`).
  A full reload is enough for the Spike.
- A node created with `sheet: null`, which is every node Foldkit Native creates, is matched against
  the global sheet(s) only (`fabric/src/css.ts:1389-1424`, `merge()` adds `globalSheet` first). The
  `:host` rules and the component-specificity bump only apply to component sheets, so they don't
  affect Foldkit.

## How classes and inline styles reach the engine, and Foldkit's mapping

Engine API (`fabric/src/engine.ts`):

- `setClasses(node, "a b c")` replaces the class set and marks the node dirty (`:2026-2031`).
  `addClass`/`removeClass` also exist (`:1995-2004`).
- `setProp(node, key, value)` (`:2183-2201`). `style` is a prop. At commit time the inline style is
  **merged shallowly on top of the cascaded result** (`:2525-2541`), so it wins over rules. The engine
  expects it in **React Native form**: camelCase keys, numbers for px. The only CSS string it parses
  is `transform` (`fabric/src/inline-transform.ts:1-12`, `boundTransform` at `engine.ts:2541`).
  Props containing a hyphen (`data-*`, `aria-*`) stay on the node for selectors to match and are
  not sent to native (`:2528-2537`). `:disabled` is answered from the `disabled` prop
  (`metro/css/compile.cjs:898-903`).
- `setCustomProperty(node, '--x', value)` sets a token on the node, scoped to it and its
  descendants (`:2242-2253`).

The Angular adapter converts DOM-shaped style values into React Native form before calling the
engine: dash-case → camelCase, `'10px'`/`'1'` → number, a `font-family` stack → its first family, and
`--x` → `setCustomProperty` (`platform/src/adapter.ts:63-112,176-244`). `class` goes straight to
`setClasses` (`:176-180`).

Foldkit's side (`packages/foldkit/src`):

- `Class: { value: string }` (`html/index.ts:580,3730`). The builder turns it into snabbdom's
  `Record<string, true>` (`html/index.ts:1568-1585,1632-1633`).
  **Mapping:** `engine.setClasses(node, value)`, or
  `Object.keys(classObject).join(' ')` when patching from the VNode. One call per change.
- `Style: { value: Record<string, string> }` (`html/index.ts:868,4655,5368`), normalised to
  **dash-case CSS names and string values** (`domReflection.ts:582-593`, applied at
  `html/index.ts:2321-2327`).
  **Mapping:** the same conversion `adapter.ts:67-112` does: camelCase the key, `px`/bare number →
  number, first `fontFamily` family, `--x` → `setCustomProperty`, everything else → one owned style
  object passed to `setProp(node, 'style', obj)` (or mutate it and call `styleChanged`, `:2231`).
- `DataAttribute` (`html/index.ts:867,2319`) maps to `setProp(node, 'data-key', v)`, which is what
  Tailwind's `data-[state=open]:` variants match (confirmed in the probe). `Disabled` maps to
  `setProp(node, 'disabled', v)`.

Limitation: inline `Style` doesn't go through the compiler, so CSS shorthands with several values
(`margin: '4px 8px'`), `var()`, `calc()` and colour functions other than the ones React Native
parses are not understood inline. Foldkit views should put those in classes, or set
`--custom-properties` inline and read them from a class. ng-native's docs recommend the same
pattern (`supported-css.md:70-72`).

## What the runtime supports

From `supported-css.md`, `css-engine.md` and `animation.md`, checked against the compiler:

- **Selectors:** type, class, id, attribute (all operators, the `i` flag), `:is/:where/:not`
  (compound arguments, plus Tailwind's `group-*`/`peer-*` shapes), `:root`, `:empty`,
  `:first/last/only/nth(-last)-child`, `:disabled`, `:focus`, `:active` (tracked by the engine), and
  every combinator (`supported-css.md:14-29`; `compile.cjs:845-968`). Not supported: pseudo-elements
  other than `::placeholder`, `:hover`, `:focus-visible`, form-state pseudo-classes, `:has()`, and
  `*-of-type` (`supported-css.md:31-57`; `compile.cjs:701-708,969-983`). `:host`/`:host-context`
  are only meaningful in a component sheet.
- **Media queries:** `width`, `height` (plain or range, px/em/rem), `orientation`,
  `prefers-color-scheme`, `prefers-reduced-motion`, combined with `and`/`or`/commas. `not`, `hover`,
  `pointer` and `print` are dropped with a warning (`compile.cjs:742-844`; `css.ts:88-121`). They are
  evaluated against the `conditions` the host passes in, and re-evaluated **only** when the host
  calls `engine.updateConditions` (`engine.ts:1975-1984`; `css-engine.md:117-126`).
- **At-rules:** `@media`, `@keyframes`, `@font-face`. Anything else is refused (`compile.cjs:679-697`).
- **Custom properties:** they cascade like inherited values and `var()` resolves per node; they can
  be seeded on the root through the `tokens` option or `updateTokens` (`css-engine.md:104-115`;
  `engine.ts:1348-1364,1793-1797`). `calc()` with tokens, `color-mix()`, relative colours and
  `light-dark()` are worked out on the device (`supported-css.md:61-84,260-266`).
- **Inheritance:** emulated for text properties (`color`, `font*`, `lineHeight`, `textAlign`, …)
  (`css-engine.md:88-102`).
- **Transitions and `@keyframes`/`animation`:** compiled into a spec that the engine interpolates in
  JS (`animation.md:13-22,38-45`). The host has to drive frames: after a commit, while
  `engine.animating`, call `advanceAnimations()` + `commit()` on `requestAnimationFrame`
  (`engine.ts:3070-3090`; reference pump `platform/src/adapter.ts:432-484`). Inline style changes
  animate too, because transitions run after the inline merge (`engine.ts:2541-2551`).
- **Values:** gradients (linear/radial), filters (platform-dependent), transforms including
  individual `translate/rotate/scale`, shadows, line clamping, logical properties, `display:
  flex|none|block|contents` (`supported-css.md:86-259`). Not supported: `grid`, `float`, tables,
  multi-column, `clip-path`, … (`supported-css.md:293-305`). Each one is dropped with a build warning
  rather than ignored silently.

## The adapter and its size

| Part | Lines (est.) | Source to port |
| --- | --- | --- |
| Metro config: `withTailwind(getDefaultConfig(__dirname), { input })` + `styles.css` | ~10 config | `tailwind/README.md` |
| Boot: `new Engine(...)` with `globalStyles`, `conditions`, `tokens: { '--hairline': … }`, `processColor`, `resolveAssetSource`, plus `engine.addClass(engine.root, 'platform-' + Platform.OS)` | ~30 | `platform/src/adapter.ts:687-744`; `device/src/conditions.ts:67-70`; `nx/files/src/main.ts` |
| Conditions watcher: React Native `Dimensions`/`Appearance`/`AccessibilityInfo`/`PixelRatio` → `updateConditions`, toggles the `dark` root class, `remeasureText` on font-scale change | ~60–80 | `device/src/conditions.ts:41-126` (framework-free logic; only its sources import Angular) |
| Safe area: render the native safe-area provider view, then on `insetsChange` → `updateTokens({ '--safe-area-inset-*' })` | ~20–30 | `components/src/safe-area-provider.ts:40-43,72-80` |
| Patch mapping: `Class` → `setClasses`; `Style` → React Native style object + `setCustomProperty`; `DataAttribute`/`Disabled` → `setProp` | ~80–100 | `platform/src/adapter.ts:63-112,176-244` |
| Commit + animation pump: one `commit()` per Foldkit render, `setOnDirty` → schedule, rAF loop while `animating`/`pending` | ~40 | `platform/src/adapter.ts:432-484` |

Total: **~250–350 LOC of TypeScript, no build-side code**. The renderer needs the commit pump
regardless, and the conditions and safe-area parts are only needed if the app uses `@media`,
`dark:` or `*-safe`. The smallest version that is still useful (static utilities, no media
queries) is the boot step plus the `Class` mapping, about 30 lines.

Risks and unknowns:

- `0.3.0` is alpha ("APIs may change before 1.0", `metro/README.md`). Pin exact versions.
- The `.angular-native/` output directory name and the `[angular-native]` warning prefix are
  cosmetic. `output` can rename the directory.
- Not yet tested on a device: no Foldkit view has rendered through `Engine` on Fabric with a
  Tailwind sheet. The probe covers compile and resolve only. Confirming it on a device belongs to
  the Spike (Demo Ladder step 1 already needs `Class`).

## Probe run without Angular

`/tmp` scratch project with `@ng-native/{tailwind,metro,fabric}@0.3.0`, `tailwindcss@4.3.3` and
`@tailwindcss/cli`. The probe:

1. A `src/view.ts` written in Foldkit style, with `h.Class('flex-1 … dark:bg-slate-900 p-4 md:p-8')`,
   a ternary `h.Class(busy ? 'opacity-50 pt-safe' : '… ios:rounded-xl android:rounded-md')`,
   `data-[state=open]:bg-red-500`, `grid`, `hover:bg-gray-100` and `transition-colors duration-200`.
2. Ran the Tailwind CLI, then `compileSheetModule` from `@ng-native/tailwind/config.cjs`. Every class
   in the file was emitted as a rule. The one warning was
   `.grid (Tailwind): dropped 'display': display: grid does not exist on native`.
   `require.cache` held **0 `@angular` modules**.
3. Imported the generated sheet together with `StyleResolver` from `@ng-native/fabric`, and resolved
   hand-built nodes (`sheet: null`) under two sets of conditions:
   - 390 pt wide, light: `p-4` → padding 16, `bg-white`. At 1024 pt wide with the `dark` class on the
     root: `md:p-8` → padding 32, `dark:bg-slate-900` → `rgb(15, 23, 43)`.
   - `pt-safe` with the root token `--safe-area-inset-top: 47` → `paddingTop: 47`.
     `ios:rounded-xl` under the `platform-ios` root class → radius 12.
   - `data-[state=open]:bg-red-500` with prop `data-state: 'open'` → red background.
   - `transition-colors duration-200` → a `$transition` spec with a 200 ms duration, which the engine
     consumes at commit time.

## Outcome

**Reusable with a known adapter** of about 250–350 LOC (sized above), with no build-side work. We
don't need to fall back to inline style objects only. Foldkit `Class` strings, together with Tailwind
and any hand-written global CSS, go through ng-native's compiler and engine as they are. Foldkit
`Style` objects need a small value conversion and work best for dynamic values and
`--custom-properties`.
