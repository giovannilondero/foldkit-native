import type { Conditions } from '@ng-native/fabric'
import { Appearance, Dimensions, PixelRatio } from 'react-native'

import type { StyleConditions } from './index.ts'

// NOTE: re-derived from `Dimensions`, `Appearance` and `PixelRatio`, because
// `@ng-native/device` (which has these) imports `@angular/core`.
/** The conditions media queries are evaluated against, read from React Native now. */
export const currentConditions = (): Conditions => {
  const { width, height } = Dimensions.get('window')
  return {
    width,
    height,
    colorScheme: Appearance.getColorScheme() === 'dark' ? 'dark' : 'light',
    fontScale: PixelRatio.getFontScale(),
  }
}

/**
 * Keeps `styles` in step with the device: a rotation or resize, a font scale
 * change (both arrive as a `Dimensions` change) or a color scheme change.
 * Returns the unsubscribe.
 */
export const watchConditions = (styles: StyleConditions): (() => void) => {
  const onChange = (): void => styles.update(currentConditions())
  const dimensions = Dimensions.addEventListener('change', onChange)
  const appearance = Appearance.addChangeListener(onChange)
  return () => {
    dimensions.remove()
    appearance.remove()
  }
}
