import type { Conditions, Engine } from '@ng-native/fabric'

/** Pushes the device's conditions into an Engine that `attachStyles` set up. */
export type StyleConditions = Readonly<{
  /** The window size, color scheme or font scale changed: restyle what depends on it. */
  update: (next: Conditions) => void
}>

export type AttachStylesOptions = Readonly<{
  /** `Platform.OS`. The root gets `platform-<os>`, which ng-native's Tailwind
   *  preset reads for its `ios:` / `android:` variants. */
  platform: string
  /** What the Engine was created with. */
  conditions: Conditions
}>

/**
 * Sets up the root of an Engine for a global stylesheet (Tailwind's, compiled
 * by `withTailwind`, passed as the Engine's `globalStyles`).
 *
 * Foldkit's `Class` already reaches `engine.setClasses`; what a sheet also
 * needs is the root classes its variants hang off: `platform-<os>` and, while
 * the color scheme is dark, `dark` (the preset's `dark:` is `.dark &`, not a
 * media query). Media queries read the conditions, which only change when the
 * host says so: the returned `update` is that call.
 *
 * React Native free, so the host wires the sources (`watchConditions`).
 */
export const attachStyles = (engine: Engine, options: AttachStylesOptions): StyleConditions => {
  engine.addClass(engine.root, `platform-${options.platform}`)

  let current: Conditions | undefined
  const update = (next: Conditions): void => {
    const previous = current
    current = next
    if (next.colorScheme === 'dark') {
      engine.addClass(engine.root, 'dark')
    } else {
      engine.removeClass(engine.root, 'dark')
    }
    if (previous === undefined) {
      return
    }
    engine.updateConditions(next)
    if ((next.fontScale ?? 1) !== (previous.fontScale ?? 1)) {
      // NOTE: commits itself, so it also flushes the restyle above.
      engine.remeasureText()
    }
  }
  update(options.conditions)

  return { update }
}
