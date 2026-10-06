# Controlled text input

`n.textInput` is controlled: `n.Value(model.text)` is what the field shows, and `n.OnChangeText(toMessage)` receives what native shows after each edit. The update may change the text (uppercase it, filter it, reset it) and the field follows. The module is `src/platform/textInput.ts`.

## Protocol

This is React Native's own protocol, with the Model in place of component state. Native edits first and JS answers later, so every write from JS carries the native edit it answers.

1. Native edits, then sends `topChange { text, eventCount }`. `eventCount` is native's edit counter. The module records `text` as the last native text and `eventCount` as the latest count, then calls `onChangeText(text)`.
2. Every render writes two props: `text` (the Model's value) and `mostRecentEventCount` (the latest count).
3. After the frame's commit, if the Model's value differs from the last native text, the module sends `dispatchCommand(node, 'setTextAndSelection', [eventCount, value, -1, -1])` and then calls `engine.remeasure(node)`. The remeasure is needed because a text input is measured from native state, which changes only after the commit that carried the text.
4. Native drops a command that is stale: iOS requires the count to equal its own, and Android requires it to be at least its own. If the user typed after `eventCount`, a newer `topChange` is already on its way and the next frame answers that one. A lagging frame can never overwrite keystrokes.
5. The cursor is not sent (`-1, -1` keeps the selection). Both platforms keep the caret's offset from the end when the text is swapped, so a same-length transform such as uppercase leaves it where the user put it, even mid-text.
6. An update that returns the same Model reference does not render. To cover that, each change also schedules a check on the next animation frame, after any render frame the Message scheduled. If the field still disagrees with the last rendered value, the same command reverts the edit, so `if (invalid) return { model }` works.

The Platform runs the after-commit work (`afterCommit` in `src/platform/index.ts`) once each commit is done, whether that commit came from a render frame or from `onDirty`.

### Why not something else

- **Writing `text` alone**: native would apply a stale echo over newer keystrokes, with no count to reject it.
- **A synchronous flush on `topChange`** (React's discrete event priority): this would beat the next keystroke only most of the time, and it fights Foldkit's one-render-per-frame model. The count makes ordering irrelevant.

## Known limits

- **iOS keyboard features fight rewrites.** If the Model rewrites the text while autocorrect, predictions or auto-capitalisation are on, UIKit's keyboard keeps its own idea of the document, and fast typing gets scrambled (letters lost or moved). Use `n.AutoCorrect(false)` (which sets both `autoCorrect` and `spellCheck`) and `n.AutoCapitalize('none')` on a field whose update transforms the text.
- **Fast typing has a measured bound on iOS.** Measured with a 50–63 character sentence typed by the simulator tooling into the uppercasing demo field (dev builds):
  - iOS simulator: no losses at 50 keys/s (20 ms per key, 7 of 7 runs; a re-run with the host under heavy load dropped one character in 1 of 7 runs). At 100 keys/s (10 ms per key), about 1 run in 5 dropped one character, when a rewrite landed during a keystroke. React Native's own `<TextInput>` with the same uppercase transform scrambled all 5 runs at 100 keys/s and lost nothing at 50 keys/s, so this is at least as good as React Native.
  - Android emulator: no losses at 50, 100 or 1,000 keys/s (20, 10 and 1 ms per key).

  The Spike's "fast typing drops no characters" criterion therefore holds up to 50 keys/s on iOS, far above human typing; this is recorded rather than fixed.
- **Messages deferred over the drain budget.** If Foldkit defers a Message past its drain budget, the step 6 check can run before that Message renders and briefly revert the field until the render lands.
- **No `selection` prop, no focus/blur/submit events**, and no `topSelectionChange` tracking yet.
